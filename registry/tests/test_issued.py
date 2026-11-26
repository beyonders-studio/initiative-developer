"""check-issued: the index publishes a listing only under the uid
initiative-packages issued it as public."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from initiative_registry.cli import main

from .conftest import FIXTURES, write_publisher

SOURCES = FIXTURES / "sources"


@pytest.fixture
def publishers(tmp_path: Path) -> Path:
    keys = tmp_path / "keys"
    assert main(["keygen", "--role", "acme", "--out", str(keys)]) == 0
    directory = tmp_path / "publishers"
    directory.mkdir()
    write_publisher(directory, "acme", keys)
    return directory


def _ledger(tmp_path: Path, **changes: dict | None) -> Path:
    entries = {
        "0ACME000000001": {
            "public_id": "acme.tracker",
            "publisher": "acme",
            "home": "public",
        },
        "0ACME000000002": {
            "public_id": "acme.weekly-overview",
            "publisher": "acme",
            "home": "public",
        },
    }
    for uid, entry in changes.items():
        if entry is None:
            del entries[uid]
        else:
            entries[uid] = entry
    path = tmp_path / "listings.json"
    path.write_text(json.dumps(entries))
    return path


def _run(ledger: Path, publishers: Path) -> int:
    return main(
        [
            "check-issued",
            "--sources",
            str(SOURCES),
            "--publishers",
            str(publishers),
            "--ledger",
            str(ledger),
        ]
    )


def test_listings_under_their_issued_uids_pass(
    tmp_path: Path, capsys, publishers: Path
) -> None:
    assert _run(_ledger(tmp_path), publishers) == 0
    assert "2 listings, each under the uid issued to it" in capsys.readouterr().out


def test_a_uid_issued_to_a_private_listing_is_refused(
    tmp_path: Path, capsys, publishers: Path
) -> None:
    """What happened to Counters: published under the uid the demo plug-in
    held privately."""
    private = {
        "public_id": "acme.demo",
        "publisher": "acme",
        "home": "acme/initiative-demo",
    }
    assert _run(_ledger(tmp_path, **{"0ACME000000001": private}), publishers) == 1
    assert (
        "acme.tracker (0ACME000000001) holds a uid issued to acme.demo"
        " (acme/initiative-demo)" in capsys.readouterr().err
    )


def test_a_uid_never_issued_is_refused(
    tmp_path: Path, capsys, publishers: Path
) -> None:
    assert _run(_ledger(tmp_path, **{"0ACME000000002": None}), publishers) == 1
    assert "acme.weekly-overview (0ACME000000002) was never issued" in (
        capsys.readouterr().err
    )


@pytest.mark.parametrize("text", ["", "[]", '{"0ACME000000001": 1}'])
def test_a_ledger_that_cannot_be_read_is_refused(
    tmp_path: Path, capsys, publishers: Path, text: str
) -> None:
    ledger = tmp_path / "listings.json"
    ledger.write_text(text)
    assert _run(ledger, publishers) == 1
    assert "listing ledger" in capsys.readouterr().err
