#!/usr/bin/env python3
from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "marketing-companies.json"
SECTIONS = ("usOpenings", "europeUkOpenings", "generalDirectory")
TIMEOUT_SECONDS = 20
USER_AGENT = "Mozilla/5.0 (compatible; shortlist-refresh/1.0; +https://github.com/)"


def request_url(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS, context=context) as response:
        return response.geturl()


def refresh_entry(entry: dict) -> bool:
    changed = False
    for key in ("applyUrl", "siteUrl", "sourceUrl"):
        value = entry.get(key)
        if not value:
            continue
        try:
            resolved = request_url(value)
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
        if resolved and resolved != value:
            entry[key] = resolved
            changed = True
    return changed


def main() -> None:
    data = json.loads(DATA_PATH.read_text())
    changed = False

    for section in SECTIONS:
        for entry in data.get(section, []):
            if refresh_entry(entry):
                changed = True

    checked_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    if data.get("updatedAt") != checked_at:
        data["updatedAt"] = checked_at
        changed = True

    if changed:
        DATA_PATH.write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
