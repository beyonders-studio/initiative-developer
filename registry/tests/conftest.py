"""A registry built from scratch in a temporary directory, with ephemeral keys."""

from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pytest
from securesystemslib.signer import CryptoSigner, SSlibKey
from tuf.api.metadata import Metadata, MetaFile, Snapshot, TargetFile, Targets

from initiative_registry import layout
from initiative_registry.build import BuildResult, build, sign_timestamp
from initiative_registry.keys import generate, signer_from_path
from initiative_registry.offline import init_root
from initiative_registry.repo import online_version, to_bytes, utc_now

FIXTURES = Path(__file__).parent / "fixtures"
PUBLISHERS = ("acme", "other")


@dataclass
class World:
    root: Path
    keys: Path
    publishers: Path
    metadata: Path
    sources: Path

    def signer(self, name: str) -> CryptoSigner:
        return signer_from_path(self.keys / f"{name}.pem")

    def listing(self, uid: str, publisher: str = "acme") -> Path:
        return self.sources / publisher / uid / "listing.json"

    def edit_listing(self, uid: str, change, publisher: str = "acme") -> None:
        path = self.listing(uid, publisher)
        document = json.loads(path.read_text())
        change(document)
        path.write_text(json.dumps(document, indent=2))

    def build(
        self,
        name: str = "out",
        *,
        target: str = "public",
        sources: list[Path] | None = None,
        package_key: SSlibKey | None = None,
        now: datetime | None = None,
    ) -> BuildResult:
        return build(
            target=target,
            sources=sources or [self.sources],
            out=self.root / name,
            keys=self.signer,
            metadata_dir=self.metadata,
            publisher_dirs=[self.publishers],
            package_key=package_key,
            now=now,
        )

    @property
    def package_key(self) -> SSlibKey:
        return self.signer(layout.PACKAGE_ROLE).public_key

    @property
    def trusted_root(self) -> Path:
        return self.metadata / "1.root.json"


def write_publisher(directory: Path, prefix: str, keys: Path) -> Path:
    template = FIXTURES / "publishers" / "acme.json"
    record = json.loads(template.read_text())
    record["prefix"] = prefix
    record["name"] = prefix.title()
    record["key"] = json.loads((keys / f"{prefix}.pub.json").read_text())
    path = directory / f"{prefix}.json"
    path.write_text(json.dumps(record, indent=2) + "\n")
    return path


@pytest.fixture
def world(tmp_path: Path) -> World:
    keys = tmp_path / "keys"
    for role in (*layout.TOP_LEVEL_ROLES, *PUBLISHERS, layout.PACKAGE_ROLE):
        generate(role, keys)
    publishers = tmp_path / "publishers"
    publishers.mkdir()
    for prefix in PUBLISHERS:
        write_publisher(publishers, prefix, keys)
    sources = tmp_path / "sources"
    shutil.copytree(FIXTURES / "sources", sources)
    metadata = tmp_path / "metadata"
    init_root(
        metadata,
        root_signer=signer_from_path(keys / "root.pem"),
        targets_signer=signer_from_path(keys / "targets.pem"),
        snapshot_key=signer_from_path(keys / "snapshot.pem").public_key,
        timestamp_key=signer_from_path(keys / "timestamp.pem").public_key,
        publisher_dirs=[publishers],
    )
    return World(tmp_path, keys, publishers, metadata, sources)


def resign_role(world: World, repo: Path, prefix: str, change) -> None:
    """Change a publisher's delegated role in a built repository, then re-sign
    it with the publisher's key and re-sign the snapshot and the timestamp."""
    metadata_dir = repo / layout.METADATA_SUBDIR
    snapshot_path = sorted(metadata_dir.glob("*.snapshot.json"))[-1]
    snapshot = Metadata[Snapshot].from_file(str(snapshot_path))
    old_version = snapshot.signed.meta[f"{prefix}.json"].version
    role = Metadata[Targets].from_file(
        str(metadata_dir / f"{old_version}.{prefix}.json")
    )
    change(role.signed)
    now = utc_now()
    role.signed.version = online_version(old_version, now)
    role.signatures.clear()
    role.sign(world.signer(prefix))
    (metadata_dir / f"{role.signed.version}.{prefix}.json").write_bytes(to_bytes(role))
    _publish_role(world, metadata_dir, snapshot, prefix, role.signed.version, now)


def add_package_role(world: World, repo: Path, files: dict[str, bytes]) -> None:
    """Sign a package role over ``files`` into a built repository, as a package
    service would, then re-sign the snapshot and the timestamp."""
    metadata_dir = repo / layout.METADATA_SUBDIR
    snapshot_path = sorted(metadata_dir.glob("*.snapshot.json"))[-1]
    snapshot = Metadata[Snapshot].from_file(str(snapshot_path))
    now = utc_now()
    for path, data in files.items():
        served = (
            repo
            / layout.TARGETS_SUBDIR
            / layout.served_target_path(path, hashlib.sha256(data).hexdigest())
        )
        served.parent.mkdir(parents=True, exist_ok=True)
        served.write_bytes(data)
    role = Metadata(
        Targets(
            version=1,
            expires=now + layout.EXPIRY[layout.PACKAGE_ROLE],
            targets={
                path: TargetFile.from_data(path, data, ["sha256"])
                for path, data in files.items()
            },
        )
    )
    role.sign(world.signer(layout.PACKAGE_ROLE))
    (metadata_dir / f"1.{layout.PACKAGE_ROLE}.json").write_bytes(to_bytes(role))
    _publish_role(world, metadata_dir, snapshot, layout.PACKAGE_ROLE, 1, now)


def _publish_role(
    world: World,
    metadata_dir: Path,
    snapshot: Metadata[Snapshot],
    name: str,
    version: int,
    now: datetime,
) -> None:
    """Name a delegated role's new version in the snapshot, then re-sign the
    snapshot and the timestamp over it."""
    snapshot.signed.meta[f"{name}.json"] = MetaFile(version=version)
    snapshot.signed.version = online_version(snapshot.signed.version, now)
    snapshot.signatures.clear()
    snapshot.sign(world.signer("snapshot"))
    snapshot_bytes = to_bytes(snapshot)
    (metadata_dir / f"{snapshot.signed.version}.snapshot.json").write_bytes(
        snapshot_bytes
    )

    timestamp = sign_timestamp(
        snapshot_bytes,
        snapshot.signed.version,
        world.signer("timestamp"),
        version=snapshot.signed.version + 1,
        now=now,
    )
    (metadata_dir / "timestamp.json").write_bytes(to_bytes(timestamp))
