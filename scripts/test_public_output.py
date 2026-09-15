#!/usr/bin/env python3
"""Controleer dat de lokale productie-uitvoer alleen publieke prijsgegevens bevat."""

from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]


# MARK: - Publieke outputcontrole
# Comment NL: Controleert lokale verwijzingen en bewaakt de bestaande App Store-links.
class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        self.urls.extend(value for key, value in attrs if key in {"src", "href"} and value)


def links(text):
    parser = Links()
    parser.feed(text)
    return parser.urls


def main():
    output = ROOT / "dist"
    assert output.is_dir(), "Run scripts/build_site.py first"
    files = [path for path in output.rglob("*") if path.is_file()]
    assert not any(path.suffix.lower() == ".csv" for path in files)
    assert not any((output / name).exists() for name in ("scripts", "tests", "PRICING.md", "CLAIMS_REVIEW.md", ".git"))
    assert [path.relative_to(output).as_posix() for path in files if path.suffix == ".json"] == ["data/prices.json"]
    for path in files:
        if path.suffix in {".html", ".js", ".mjs", ".json"}:
            assert not re.search(r"proceeds|lauch offer|lifetime offer|best value|save ~35%|save 71%", path.read_text(), re.I), path
        if path.suffix == ".html":
            for url in links(path.read_text()):
                if url.startswith("/") and not url.startswith("//"):
                    local = output / unquote(urlparse(url).path).lstrip("/")
                    assert local.exists(), f"Broken asset/link: {path}: {url}"
    for app in ("pulsefx", "pulsevinyl", "pulserecipes", "pulsereflect", "pulsewiish"):
        relative = f"{app}/index.html"
        previous = subprocess.check_output(["git", "show", f"HEAD:{relative}"], cwd=ROOT, text=True)
        current = (ROOT / relative).read_text()
        appstore = lambda text: [url for url in links(text) if url.startswith("https://apps.apple.com/")]
        assert appstore(previous) == appstore(current), f"Changed App Store links: {app}"
    print(f"PASS: {len(files)} public files; all local references resolve; no raw exports, private fields or excluded offer; App Store links unchanged.")


if __name__ == "__main__":
    main()
