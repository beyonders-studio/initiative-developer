"""The package role: delegated beside the publishers, never signed here."""

from __future__ import annotations

import json

import pytest
from tuf.api.metadata import Metadata, Targets

from initiative_registry import RegistryError, layout
from initiative_registry.keys import generate, signer_from_path
from initiative_registry.offline import sign_offline
from initiative_registry.repo import TARGETS_FILE
from initiative_registry.verify import verify

from .conftest import World, add_package_role


def _delegate(world: World) -> None:
    sign_offline(
        world.metadata,
        targets_signer=world.signer("targets"),
        publisher_dirs=[world.publishers],
        package_key=world.package_key,
    )


def test_targets_delegates_the_package_role_over_its_paths(world: World) -> None:
    _delegate(world)
    targets = Metadata[Targets].from_file(str(world.metadata / TARGETS_FILE))
    role = targets.signed.delegations.roles[layout.PACKAGE_ROLE]
    assert role.keyids == [world.package_key.keyid]
    assert role.paths == ["entitlements/*", "grants/*"]
    assert role.terminating is True


def test_the_public_index_carries_the_delegation_and_no_role(world: World) -> None:
    _delegate(world)
    result = world.build(package_key=world.package_key)
    names = sorted(p.name for p in (result.out / "metadata").iterdir())
    assert not any(name.endswith(f".{layout.PACKAGE_ROLE}.json") for name in names)
    checked = verify(result.out, world.trusted_root, target="public")
    assert checked.package_version is None


def test_a_delegation_needs_its_key_at_build(world: World) -> None:
    _delegate(world)
    with pytest.raises(RegistryError, match="no package key was given"):
        world.build()


def test_a_key_needs_its_delegation(world: World) -> None:
    with pytest.raises(RegistryError, match="package role is not delegated"):
        world.build(package_key=world.package_key)


def test_another_key_is_refused(world: World) -> None:
    _delegate(world)
    generate("package-2", world.keys)
    other = signer_from_path(world.keys / "package-2.pem").public_key
    with pytest.raises(RegistryError, match="package key is not the delegated one"):
        world.build(package_key=other)


def test_a_package_reads_its_role_and_the_public_index_refuses_it(
    world: World,
) -> None:
    _delegate(world)
    result = world.build(package_key=world.package_key)
    terms = json.dumps({"listing_uid": "0ACME000000001"}).encode()
    add_package_role(world, result.out, {"entitlements/0ACME000000001.json": terms})

    checked = verify(result.out, world.trusted_root)
    assert checked.package_version == 1
    with pytest.raises(RegistryError, match="public index carries a package role"):
        verify(result.out, world.trusted_root, target="public")


def test_the_package_role_signs_nothing_outside_its_paths(world: World) -> None:
    _delegate(world)
    result = world.build(package_key=world.package_key)
    add_package_role(world, result.out, {"publishers/acme/stray.json": b"{}"})
    with pytest.raises(RegistryError, match="outside its delegation"):
        verify(result.out, world.trusted_root)


def test_package_is_not_a_publisher_prefix() -> None:
    assert "package role" in (layout.prefix_problem(layout.PACKAGE_ROLE) or "")
