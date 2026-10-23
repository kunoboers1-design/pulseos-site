#!/usr/bin/env python3
"""Controleer claimcorrecties, releasevoorbehouden en behoud van regionale prijzen."""

import argparse
from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APPS = ('pulsefx', 'pulsevinyl', 'pulserecipes', 'pulsereflect', 'pulsewiish',
        'pulsesidequest', 'pulselift', 'pulsehabits')


# MARK: - Publieke tekst
# Comment NL: Ook metadata en ingeklapte inhoud tellen mee; scripts en CSS niet.
class PublicText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        values = dict(attrs)
        if tag == 'meta' and 'description' in (values.get('name', '') + values.get('property', '')):
            self.parts.append(values.get('content', ''))

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def public_text(html):
    parser = PublicText()
    parser.feed(html)
    return ' '.join(' '.join(parser.parts).split())


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--before', type=Path, help='Optional pre-edit website snapshot for preservation checks')
    before = args.parse_args().before
    pages = {app: (ROOT / app / 'index.html').read_text() for app in APPS}
    texts = {app: public_text(html) for app, html in pages.items()}
    forbidden = {
        'pulsefx': r'notes per account|structured notes per account|custom contract sizes|\b[35] (free alerts|accounts)\b|weeks free',
        'pulsevinyl': r'pre-orders?|pre-order alerts|never miss|always first|unlimited scans|always free|\b10 (owned|wanted)|days free',
        'pulserecipes': r'any recipe site|any website|20 recipes|extra photos|import recipe text from photos',
        'pulsereflect': r'free.writ|unlimited entries|mood tracking|mood logs|morning and evening modes|monthly look-back|Monday|quarterly|unlimited custom questions',
        'pulsewiish': r'any shop|any URL|all features included|every feature included|\b20 items|real.time|lock screen|Aurora|Rose and Forest',
        'pulsesidequest': r'\b(72|92)\b|unlimited custom sidequests|up to five|5-, 15- or 30-minute',
        'pulselift': r'1RM|filter by equipment|coming soon',
        'pulsehabits': r'coming soon',
    }
    for app, pattern in forbidden.items():
        assert not re.search(pattern, texts[app], re.I), f'Unsupported claim in {app}'
        assert not re.search(r'\bTODO\b|local code.audit|release proof required', texts[app], re.I)
        assert len(re.findall(r'id="features"', pages[app])) == 1

    assert 'Trade Journal — Pro' in texts['pulsefx']
    assert 'PulseFX does not place trades' in texts['pulsefx']
    recipes_features = re.search(r'<section\b(?=[^>]*id="features")[^>]*>.*?</section>', pages['pulserecipes'], re.S)[0]
    assert 'Recipe-generated shopping lists require Premium' in recipes_features
    assert 'Review and edit before saving' in recipes_features
    assert 'Website prices may not be up to date.' in texts['pulsefx']
    assert 'paused' in texts['pulselift'].lower()
    assert 'if development resumes' in texts['pulselift']
    assert 'in development' in texts['pulsehabits']
    assert 'subject to change' in texts['pulsehabits']
    assert 'does not collect, hold or transfer money' in texts['pulsewiish']

    # Comment NL: Radar blijft exact neutraal; basiswaarde en Radar worden geen Pro-voordeel.
    vinyl = pages['pulsevinyl']
    radar = re.search(r'<summary>Release Radar</summary>(.*?)</details>', vinyl, re.S)[1]
    assert public_text(radar) == 'Explore Release Radar for music discoveries.'
    for plan in re.findall(r'<ul class="vinyl-plan-features">(.*?)</ul>', vinyl, re.S):
        assert not re.search(r'Radar|collection value', plan, re.I)
    assert 'Full Rescan' not in texts['pulsevinyl']

    if before:
        for name in ('data/prices.json', 'pricing.mjs', 'site-pages.css'):
            assert (ROOT / name).read_bytes() == (before / name).read_bytes(), f'Changed preserved file: {name}'
        for app, current in pages.items():
            previous = (before / app / 'index.html').read_text()
            for pattern in (
                r'<[^>]*data-price-plan="[^"]+"[^>]*>.*?</(?:div|span)>',
                r'<p class="price-disclaimer">.*?</p>',
                r'<span class="fx-changelog-version">.*?</span>',
                r'href="https://apps.apple.com/[^"]+"',
            ):
                assert re.findall(pattern, previous, re.S) == re.findall(pattern, current, re.S), (app, pattern)
    print('PASS: eight app pages; conservative feature claims, plan consistency, neutral Radar and development status.')
    if before:
        print('PASS: original regional dataset, picker code, CSS, price bindings, disclaimers, release version labels and App Store links preserved.')


if __name__ == '__main__':
    main()
