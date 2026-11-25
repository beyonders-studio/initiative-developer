"""Every listing in the sources holds the uid initiative-packages issued it.

A listing's uid names it for good: Initiative stores it on every install. So
no listing chooses its own. initiative-packages issues every uid, for the
public index and for the private listings its packages carry alike, and holds
each in its ledger, ``listings.json``: the uid's ``public_id``, ``publisher``
and ``home``, ``public`` for this index. Its README, "The listing ledger",
says how one is issued.

This index publishes a listing only under a uid the ledger issued it as
``public``. A listing here under a uid the ledger issued to a private
listing, or under one it never issued, is refused before anything is
signed: in November 2026 Counters was published under the uid the demo
plug-in held privately, and installs of each read as the other.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from pathlib import Path

from .errors import RegistryError
from .sources import Listing

PUBLIC = "public"


def load_ledger(path: Path) -> dict[str, Mapping[str, str]]:
    try:
        ledger = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistryError(
            f"the listing ledger {path} could not be read: {exc}"
        ) from exc
    if not isinstance(ledger, dict) or not all(
        isinstance(entry, dict) for entry in ledger.values()
    ):
        raise RegistryError(f"the listing ledger {path} is not an object of uids")
    return ledger


def check_issued(listings: Iterable[Listing], ledger: Mapping[str, Mapping]) -> None:
    """Each listing's uid is issued to it, as public. Every one that is not
    is named."""
    problems = []
    for listing in listings:
        entry = ledger.get(listing.uid)
        if entry is None:
            problems.append(f"{listing.public_id} ({listing.uid}) was never issued")
            continue
        issued = (entry.get("public_id"), entry.get("publisher"), entry.get("home"))
        if issued != (listing.public_id, listing.publisher, PUBLIC):
            problems.append(
                f"{listing.public_id} ({listing.uid}) holds a uid issued to"
                f" {issued[0]} ({issued[2]})"
            )
    if problems:
        raise RegistryError(
            "; ".join(problems)
            + "; a listing takes the uid initiative-packages issues it"
            " (`initiative-packages issue-id --home public`)"
        )
