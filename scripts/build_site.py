#!/usr/bin/env python3
"""Maak lokaal een statische productie-uitvoer zonder bronexports of ontwikkelbestanden."""

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "dist"
PAGES = ("about", "privacy", "support", "pulsefx", "pulsehabits", "pulselift",
         "pulserecipes", "pulsereflect", "pulsesidequest", "pulsevinyl", "pulsewiish", "subscribed")
ASSETS = {".html", ".css", ".js", ".mjs", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2"}


# MARK: - Statische productie-uitvoer
def build():
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()
    paths = [path for path in ROOT.iterdir() if path.is_file() and path.suffix in ASSETS]
    paths += [ROOT / "robots.txt", ROOT / "sitemap.xml", ROOT / "data/prices.json"]
    for directory in (*PAGES, "images"):
        paths += [path for path in (ROOT / directory).rglob("*") if path.is_file() and path.suffix in ASSETS]
    for path in paths:
        target = DEST / path.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    print(f"Built {len(paths)} static files in {DEST}")
    print("Cloudflare Pages Functions remain in functions/ and are handled by the existing hosting pipeline.")


if __name__ == "__main__":
    build()
