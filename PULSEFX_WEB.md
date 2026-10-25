# PulseFX web preview

Static HTML + CSS + native JavaScript modules, matching the existing site. No build dependencies or production deployment are added. Shared PulseOS styles, fonts, wordmark, button classes and directory-based routes are reused. The web preview is always dark and uses an orange accent scoped to `.fx-web`.

## Local preview

```sh
python3 scripts/build_site.py
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

- Marketing: http://127.0.0.1:8765/pulsefx/ (retained)
- Web app entry: http://127.0.0.1:8765/pulsefx/app/
- Login / demo entry: http://127.0.0.1:8765/pulsefx/login/
- Dashboard: http://127.0.0.1:8765/pulsefx/dashboard/
- Sections use `?view=calculator|accounts|journal|settings` on the dashboard route.
- Account details use `&account=atlas|personal|practice`; trade details use `&trade=t1` through `t8`.

Every entry is a real directory with `index.html`, so direct navigation, refresh and browser history work without server rewrites. `/pulsefx/app/` and `/pulsefx/login/` render the same welcome screen. There is no authentication gate: the dashboard is intentionally public demo data. The three small HTML shells share one UI module. JavaScript is required; a noscript link leads to the product page.

## Demo behavior

`pulsefx/app/demo-data.mjs` is the single fictional snapshot (October 23, 2026). All three accounts use USD. Balances equal starting balances plus closed-trade P&L; open positions have no price feed or unrealized P&L. The balance chart follows the closed trades chronologically. Figures do not represent user results.

The repository contract is asynchronous: `load()`, `saveNote(tradeId, note)`, `reset()`. UI code only talks to this repository. Only demo journal notes are persisted, under `pulsefx.web.demo.v1`; calculator inputs and filters are transient. Notes are rendered as escaped text, length limited and schema validated. Corrupt storage falls back to the original sample; failed writes use memory and display a status. Reset overwrites only this demo key and preserves unrelated site preferences. Changes are not synchronized between already-open tabs; reload to read the latest saved notes.

Calculator: `risk amount = balance × risk / 100`, `lots = risk amount / (stop pips × pip value per standard lot)`. Positive finite inputs are required; risk is at most 100%. The initial pip value of USD 10 is an illustrative EUR/USD assumption, not a rate lookup. The UI shows the risk amount, unrounded result, size rounded down to 0.01 lot, and resulting planned risk. A result below the assumed minimum is flagged. Fees, spread, slippage, margin, conversion and broker-specific constraints are excluded.

## Future CloudKit integration

**Update:** an opt-in, read-only test now lives at `/pulsefx/icloud/`. See [online test setup](PULSEFX_ICLOUD_TEST.md) for the required Cloudflare Pages variables and environment-specific CloudKit API token. It stays disabled without configuration. The instructions below describe the original demo boundary and historical design; the separate test adds authentication and read calls, but no writes or Pro verification. The user requested a deployable test instead of the earlier local-only hosting proposal.

The source-based investigation and phased integration proposal are documented in [PulseFX CloudKit integration plan](PULSEFX_CLOUDKIT_PLAN.md). This is a plan only; no live connection has been implemented.

The 25 October schema review and concrete field mapping are documented in the local [CloudKit read-probe design](</Users/kunoboers/Desktop/PulseOS/3. Appstore Connect bestanden/PulseFX/PulseFX-Web-Read-Probe-2026-10-25.md>). Production schema inspection and native data exchange have since been confirmed; CloudKit JS access remains unverified. The proposed probe belongs outside this website's build inputs. No runtime or access configuration was changed for this design.

The demo routes do not authenticate or load CloudKit data. Their `Connect with iCloud` button remains disabled and labeled `Coming soon`; the separate iCloud test is linked explicitly. Neither mode implements CloudKit writes, payments, subscription checks or Pro verification. Demo data is never represented as linked user data.

Before creating a separate real-data repository adapter:

1. Use the inspected **PulseFX** schema and native entitlements as the starting point. Confirm the actual user's private zones and record responses in the separate browser probe; schema inspection and native synchronization do not prove web compatibility.
2. Research and validate browser CloudKit authentication and access to that native storage. Ordinary Sign in with Apple establishes identity; it does **not** automatically grant access to iCloud records.
3. Define authenticated loading, account isolation, supported writes, conflict handling, errors, permission revocation and sign-out before enabling any real-data route.
4. Keep demo and authenticated modes explicitly separate. Decide subscription entitlements independently; no demo state is proof of Pro access.

This preparation is an adapter boundary, not a claim that native CloudKit data can already be read from the browser.

## Checks

```sh
node scripts/test_pulsefx.mjs
python3 scripts/build_site.py
python3 scripts/test_public_output.py
PLAYWRIGHT_PATH=/path/to/existing/playwright node scripts/test_pulsefx_browser.mjs
```

The browser check uses an existing Playwright installation, with the local preview running. It checks direct routes, mobile/tablet/desktop overflow, demo navigation, filters and empty states, calculator validation and stale-result clearing, safe note persistence and reset, and browser errors. Screenshots are written to the OS temporary directory. No dependency is added to the website.
