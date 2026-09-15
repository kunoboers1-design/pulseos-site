# Regional App Store pricing

## Updating prices

Keep the original App Store exports outside this repository, for example in Downloads. Never place them in `data/`, `images/`, or `dist/`: they contain private proceeds fields.

From the repository root, using Python 3 (standard library only):

```sh
python3 scripts/import_prices.py --source-dir "$HOME/Downloads"
python3 scripts/import_prices.py --source-dir "$HOME/Downloads" --check
python3 scripts/test_prices.py
python3 scripts/build_site.py
python3 scripts/test_public_output.py
```

For tests with another source directory, set `PRICE_SOURCE_DIR` to that directory. The importer reads only the nine filenames explicitly listed in `scripts/import_prices.py`; it never scans a directory for CSVs. Keep these names when replacing exports:

| File | App | Option |
| --- | --- | --- |
| PulseRecipes.csv | PulseRecipes | Lifetime |
| Pulsevinyl Lifetime.csv | PulseVinyl | Lifetime |
| 1 maand Pulsevinyl.csv | PulseVinyl | Monthly |
| 1 jaar prijzen Pulse vinyl.csv | PulseVinyl | Yearly |
| PulseFX life time kosten.csv | PulseFX | Lifetime |
| Pulsefx 1 maand.csv | PulseFX | Monthly |
| Pulsefx 1 jaar.csv | PulseFX | Yearly |
| Pulsereflect life time.csv | PulseReflect | Lifetime |
| Pulsewiish life time.csv | PulseWiish | Lifetime |

The launch-offer export is excluded. The public JSON contains only the import timestamp, source region names, app/option identifiers, currency codes and consumer prices. `importedAt` records when the files were imported; it is **not** a live App Store verification date. Prices remain decimal strings until presentation to avoid changing source precision.

The importer uses Python's CSV parser and named columns, rejects duplicate regions/columns, malformed rows, missing fields and invalid amounts, and reports missing product/region combinations. `--check` compares every public field with the current sources without modifying the dataset. Missing combinations must be reviewed, never filled using another country. Invalid input fails before replacing the previous JSON. The Netherlands test values intentionally act as a baseline: update those expectations only when a reviewed replacement export changes them.

## Website behavior

- `data/prices.json` is the single central dataset.
- `pricing.mjs` creates the same labelled searchable region selector on all five pricing sections and updates each existing card by app, option and exact source region.
- The default is Netherlands. The browser stores a valid choice under `pulseos.appStoreRegion`; changes also sync between open tabs and when returning through browser history.
- With unavailable storage, selection still works for the current page. Persistence across navigation/reload cannot be provided without browser storage; those pages return to Netherlands.
- `Intl.NumberFormat('en', { style: 'currency', currencyDisplay: 'code', … })` distinguishes USD, AUD and other currencies, and respects zero-decimal currencies such as JPY. There is no exchange-rate conversion or geolocation.
- Missing/invalid prices, failed JSON requests and disabled JavaScript show “Check price in the app”. Missing data does not imply regional app unavailability.
- Monthly and Yearly show the full price per month/year; Lifetime is labelled “One-time purchase”. Existing feature descriptions, free tiers, trial text and download links are preserved; comparative discount claims were removed.
- The HTML contains a safe fallback rather than a potentially misleading default price before data loads.

## Local build and browser checks

This project is plain HTML/CSS/JavaScript and previously had no package manifest, test command or production build. `scripts/build_site.py` creates a local static `dist/` using permitted asset types and the single approved JSON. It excludes development scripts, tests, docs and CSV files. It does not deploy anything or change hosting settings. Existing Cloudflare Functions remain in `functions/`; this static build does not compile or test them.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
# In another terminal, with Playwright already available:
node scripts/test_pricing_browser.mjs
```

Set `PLAYWRIGHT_PATH` to an existing Playwright package directory if it is not resolvable by Node. Set `PRICE_TEST_URL` to use another local server. No runtime dependencies are added to the website. Browser screenshots are saved to the system temporary directory under `pulseos-pricing-checks`.

The browser suite covers all five pages, Netherlands, United States, United Kingdom, Japan, Albania, Australia, same-currency regional differences, persistence, actual page links, browser history, cross-tab changes, search filtering and keyboard selection, accessible labels/status, 1440/390/320px widths, long VND amounts, blocked storage, missing/invalid individual prices, failed requests and JavaScript disabled.

## Files changed

- Five app `index.html` files: data bindings, neutral fallback, period labels, disclaimer, module loading, removal of discount claims.
- `site-pages.css`: compact selector, responsive price cards and readable featured cards in both existing themes.
- `theme.js`: tolerate blocked storage so the existing theme control continues working.
- `pricing.mjs`, `data/prices.json`: shared behavior and public source prices.
- `scripts/import_prices.py`, `scripts/test_prices.py`, `scripts/test_pricing_browser.mjs`, `scripts/test_public_output.py`, `scripts/build_site.py`: repeatable import, validation, browser checks and local static build.
- `.gitignore`: exclude local builds, Python caches and raw CSVs from Git.

No commit, push or deployment is part of these commands.

## Verification record — 15 September 2026

- Nine allowed exports, 175 rows each: **1,575 consumer prices across 175 regions**, with zero missing combinations. No duplicates, missing required values or invalid amounts. All public prices and currencies match their source rows.
- All nine Netherlands/EUR baseline prices match. PulseRecipes United States is USD 12.99; Albania is USD 14.99, confirming selection by region rather than currency.
- Four Python test cases pass, including parser/validation failure scenarios. The local static build contains 110 files, and all local HTML asset/link references resolve. The public-output check confirms no proceeds fields, raw CSVs, excluded offer or discount claims; existing App Store links match Git HEAD.
- Chromium checks cover the functional cases listed above. Screenshots were inspected for desktop and mobile pricing in the existing light/dark themes, including long amounts and missing-price fallbacks. These are browser viewport checks, not physical iPhone or VoiceOver tests.
- A pre-existing `also-by.js` error prevents the related-app cards from being inserted on these app pages: `main.insertBefore` is passed a nested section rather than a direct child. Its unchanged source was checked against Git HEAD. The browser test reports this known error separately and rejects any other page error. It does not affect pricing. This unrelated component was left unchanged.
- No live App Store price verification, Safari/device test, Cloudflare Functions test or deployment was performed.

## Searchable region picker

Type a country or region name to filter the list (case- and accent-insensitive). Select a result by click/tap or with the arrow keys and Enter. Escape cancels the search. Leaving the field confirms an exact country name or restores the previous selection, so incomplete or unknown text never changes the prices. An empty search shows every source region. The combobox exposes its expanded state, active option and list to assistive technology.
