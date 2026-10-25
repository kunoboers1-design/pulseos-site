# PulseFX web Premium — installatie en verificatie

Deze implementatie staat lokaal. Er is geen server uitgerold, sleutel aangemaakt, abonnement gewijzigd of CloudKit-record geschreven. De bestaande CloudKit-lezer blijft werken zonder deze service. Zonder expliciete serverconfiguratie blijven echte Premium-statistieken vergrendeld; de afzonderlijke fictieve demo werkt wel.

## Onderdelen

- `/pulsefx/icloud/`: bestaande CloudKit-verbinding, accounts/journal en nieuw statistiekpaneel, dark/light, mobiel.
- `pulsefx/app/statistics.mjs`: deterministische berekeningen, gedeeld door server en fictieve preview.
- `functions/api/pulsefx-premium/[[path]].js`: same-origin Pages-proxy. Stuurt uitsluitend de vijf toegestane method/path-combinaties door naar een vast ingestelde HTTPS-service. Geen API-sleutel of Apple-key in publieke configuratie.
- Deze map: Node 24+ service met de officiële Apple App Store Server Library 3.1.0 en SQLite. De library gebruikt X.509/online certificaatcontrole; dit is geen rechtstreeks uitvoerbare Pages Function. Hosting moet Node, uitgaand Apple/OCSP-verkeer en een persistente schijf ondersteunen.
- Native `WebPremiumLinkView.swift`, bereikbaar vanuit Settings op iOS en macOS. De bestaande PurchaseManager en aankoopflow zijn niet gewijzigd.

## Autorisatiecontract

1. Browser `POST pair`: server genereert 128-bit code, bewaart alleen hash, geldigheid vijf minuten. De browser ontvangt apart een willekeurig 256-bit HTTP-only Secure SameSite=Strict cookie (`__Host-pulsefx-premium`, maximaal twaalf uur).
2. Gebruiker voert de code van **zijn eigen browser** in de native app in en bevestigt expliciet. De app leest uitsluitend StoreKit `.verified` current entitlements en verstuurt `jwsRepresentation` naar `POST confirm`. Debug-Premium, UserDefaults en losse transactie-ID's tellen niet. Geen automatische aankoop of restore.
3. De server verifieert Apple's handtekening/certificaatketen, bundle `com.templateos.fxlotsize`, environment en allowlist van producten. Daarna vraagt hij actuele transactie- en abonnementsstatus op bij Apple. Alleen status 1 met toekomstige expiry telt. Grace period/billing retry wordt conservatief niet toegekend, aansluitend op de huidige native vervalcontrole. Lifetime vereist een niet-ingetrokken non-consumable.
4. Code wordt atomair één keer verbruikt. Alleen de oorspronkelijke browsercookie krijgt toegang. De versleuteld opgeslagen aankoopverwijzing hoort bij deze tijdelijke sessie.
5. `GET session` en iedere `POST statistics` controleren de aankoop opnieuw bij Apple. Geen toegang bij fout, terugbetaling, verlopen sessie of mislukte verificatie. Lopende berekeningen worden bij navigatie, andere filters, nieuwe CloudKit-read of disconnect genegeerd/geannuleerd; de getoonde toegang vervalt ook met de cookie/aankoop.
6. `DELETE session` verwijdert de huidige sessie en cookie. Andere browsers zijn afzonderlijke sessies.

Dit is bewust **browserautorisatie door de koper**, geen permanente binding tussen iCloud-account en App Store-account. Die accounts kunnen verschillen. Er wordt geen `appAccountToken` achteraf aan bestaande aankopen toegekend. Een ondertekend aankoopbewijs is gevoelig: iemand die dat bewijs buitmaakt kan het tijdens zijn geldigheid aanbieden. Daarom geen logging, permanente opslag of redirects van bewijs, TLS en expliciete anti-phishing bevestiging. De native app zelf is niet met App Attest geattesteerd. Claims dat alleen ongewijzigde apps kunnen koppelen of dat Apple- en iCloud-identiteiten gelijk zijn, worden niet gedaan.

Ondersteunde producten (zelfde bestaande native IDs):

- `com.templateos.fxlotsize.pro.weekly.v1` (legacy)
- `com.templateos.fxlotsize.pro.monthly.v1`
- `com.templateos.fxlotsize.pro.yearly.v1`
- `com.templateos.fxlotsize.pro.lifetime.v1` (legacy)

## Server installeren

Een lokale preview met expliciet uitgeschakelde Apple- en Premium-API's:

```sh
python3 scripts/build_site.py
python3 scripts/preview_pulsefx.py
```

Open `http://127.0.0.1:8766/pulsefx/icloud/?statistics=demo#premium-statistics`. Deze URL kiest alleen de fictieve dataset; hij geeft geen echte Premium-toegang.

Vanuit de repositoryroot:

```sh
npm ci --prefix services/pulsefx-premium --ignore-scripts
node --test tests/pulsefx-premium/*.test.mjs tests/pulsefx-cloudkit/*.test.mjs
```

Zet de variabelen uit `.env.example` in de beveiligde runtime-configuratie. Node leest dit bestand niet automatisch. Gebruik een secret manager of expliciete environment-injectie, niet de publieke Pages-variabelen voor Apple-private keys.

- `APPLE_IAP_KEY_FILE`: pad naar een **In-App Purchase** key uit App Store Connect → Users and Access → Integrations → In-App Purchase. Een CloudKit-browser-token is hiervoor niet geschikt. Geen bestaande algemene App Store Connect-key zonder controle hergebruiken.
- `APPLE_KEY_ID`, `APPLE_ISSUER_ID`: van die sleutel.
- `APPLE_APP_ID`: numerieke App Store-ID. De bestaande site linkt naar `6751821638`; bevestig dit bij de app in App Store Connect.
- `APPLE_ROOT_CERTIFICATES`: kommagescheiden, lokaal beheerde DER-rootcertificaten gedownload van Apple's PKI-pagina. Geen certificaten uit een clientrequest als vertrouwensanker gebruiken.
- `APPLE_ENVIRONMENT`: exact `Production` of `Sandbox`. Geen automatische fallback. Sandbox wordt geweigerd voor de productie-origin `https://pulseos.eu`.
- `PULSEFX_WEB_ORIGIN`: exacte HTTPS-origin, zonder trailing slash/path.
- `PULSEFX_SERVICE_SECRET`: minstens 64 willekeurige tekens, gedeeld met alleen de Pages-proxy.
- `PULSEFX_SESSION_KEY`: 32 cryptografisch willekeurige bytes, als 64 hextekens, voor AES-256-GCM van aankoopverwijzingen. Apart van service-secret en database bewaren. Rotatie maakt bestaande sessies ongeldig; verwijder de tijdelijke database bij rotatie.
- `PULSEFX_SESSION_DB`: bestand op een private persistente schijf, directory alleen toegankelijk voor de service. SQLite bevat geen CloudKit-records, JWS, accountnamen of handelsgegevens. Geen langdurige backups van deze tijdelijke sessiedatabase. Eén service-instantie; geen meerdere losstaande SQLite-replica's achter een loadbalancer.

Start vanuit deze map met `npm start`. Standaard luistert de service alleen op `127.0.0.1:8788`; een TLS-proxy/hosting-endpoint is vereist voor Pages. Backendverzoeken vereisen een secret met constant-time vergelijking. Beperk daarnaast netwerktoegang waar de host dat ondersteunt; schakel requestbody-, cookie- en authorization-logging en tracing uit bij de host/proxy. Configureer een hostingbrede request/concurrency-limiet; de service heeft daarnaast persistente limieten per door Cloudflare vastgestelde IP-hash (30/min per route; confirm 8/min). Een multi-IP volumetrische aanval valt buiten die applicatielimiet.

Optioneel is een Dockerfile aanwezig; vanaf de repositoryroot:

```sh
docker build -f services/pulsefx-premium/Dockerfile -t pulsefx-premium .
```

Mount private keys/certificaten read-only en de sessiedirectory schrijfbaar voor uid 1000. De container is niet uitgerold; de Docker-image is geen onderdeel van de statische site-output.

## Pages configuratie

Alleen voor de bedoelde omgeving, aanvankelijk staging:

| Variabele | Waarde |
| --- | --- |
| `PULSEFX_PREMIUM_ENABLED` | `true`, pas na werkende serverconfiguratie |
| `PULSEFX_PREMIUM_ORIGIN` | exacte origin van die website |
| `PULSEFX_PREMIUM_SERVICE_URL` | vaste HTTPS-origin van de Node-service, geen pad/query |
| `PULSEFX_SERVICE_SECRET` | zelfde secret als server; als encrypted secret opslaan |

De vier bestaande `PULSEFX_CLOUDKIT_*` variabelen blijven ongewijzigd. Premium vereist geen CloudKit-schemawijziging, server-to-server CloudKit-key of nieuwe write-permissies.

## Native builds en echte aankoopproef

Beide app-targets bevatten het gedeelde scherm. `PULSEFX_PREMIUM_WEB_ORIGIN` is standaard `https://pulseos.eu`; een aparte stagingbuild mag `https://staging.pulseos.eu` gebruiken. Die buildsetting wordt als `PulseFXPremiumWebOrigin` in Info.plist opgenomen. Andere origins worden door de app geweigerd. De staging-website/DNS/hosting moet nog worden ingericht. Deel geen .p8 of wachtwoord in chat.

1. Zet een geïsoleerde staging-site/service op, eigen secrets/database en `APPLE_ENVIRONMENT=Sandbox`. Geef de native stagingbuild `PULSEFX_PREMIUM_WEB_ORIGIN=https://staging.pulseos.eu` mee. TestFlight-aankopen zijn Sandbox; stuur die niet naar de Production-service.
2. Test met echte Sandbox-aankopen: actief maand/jaar, legacy weekly/lifetime voor zover testbaar, verlenging, verlopen, ingetrokken/refund, geen aankoop, offline verificatie. Een lokale StoreKit-configuratie is geen Apple-serverbewijs en wordt niet op productie vertrouwd.
3. Loop op iPhone én Mac de eigen-browser-bevestiging door, controleer vijf-minutenverval, hergebruik, uitloggen, sessieverval en iCloud-accountwissel. Vergelijk resultaten per valuta en openingsperiode met de native app. De browserdata komt uit de bestaande read-only CloudKit-lezer, niet uit de aankoopservice.
4. Pas na deze proef: productie-serverconfiguratie, website-deployment en native App Store-update afzonderlijk laten vrijgeven. Er is niets automatisch gepubliceerd. Marketingversie/buildnummer zijn niet opgehoogd.

## Statistiekbereik en datakwaliteit

Totaal/gemiddeld/beste/slechtste R, winrate inclusief break-even, R-profitfactor, gemiddelde lots, gesloten-trade-R-drawdown, cumulatieve R, P&L per valuta, accounts, instrumenten, maanden, weekdagen, openingsuren en dagresultaten. Datums zijn UTC, gefilterd op opening (legacy: creatie), met inclusieve gekozen einddag. Dit kan bij middernacht verschillen van de lokale kalenderinstellingen van de native app.

Alleen actieve accounts en eenduidig gekoppelde gesloten trades met consistente uitkomst doen mee. Geen stilzwijgende deduplicatie tussen tradegeneraties. Ontbrekende R wordt expliciet als nul vermeld, gelijk aan de native kerncalculator. Legacy R = P&L / (stop-loss-pips × pip-value × lots); modern gebruikt finalRR, anders daadwerkelijke exit/entry/stop. Geplande targets worden nooit als werkelijk resultaat gebruikt. Missende P&L/valuta wordt niet bijgeteld. Bij incomplete/stale snapshots geen live berekening.

Dit is geen reconstructie van account-equity: stortingen, opnames, screenshots, notities, journal-tags/psychologie, target-hit/Edge Score en ongerealiseerde P&L zijn niet opgenomen. De algemene native kerncijfers zijn vertaald; niet elk uitgebreid native analysepaneel is al gerepliceerd. Maximaal 1.000 accounts, 10.000 trades en 8 MB per statistiekrequest; grotere snapshots moeten expliciet worden afgehandeld voordat deze grenzen worden verhoogd.

De server ontvangt gepseudonimiseerde rekenvelden en geeft alleen aggregaten terug. Namen, CloudKit-identiteiten en -tokens, recordsleutels, notities en opgeslagen balances worden niet verzonden. De UI vermeldt dit vóór de berekenknop; de privacy-pagina beschrijft de flow. Geen logging van aankoop- of handelsdata. Hostingretentie en App Store-privacyvermeldingen moeten bij de daadwerkelijke host/release aansluiten.

## Uitgevoerde lokale controles

- Unit tests van mapper/reader/statistieken en Premium/proxy, inclusief de echte Apple-library die een vervalst JWS afwijst. Positieve Apple-responses in tests zijn expliciet synthetisch.
- Browserproef met geblokkeerd extern verkeer en fictieve CloudKit/Apple-responses: dark/light, 320–1440 px, filters, lege/stale/partial data, late responses, XSS, paywall, pairing, intrekking en minimale payload.
- Native iOS-simulator- en Mac-build zonder code signing; geen installatie of appstart en geen echte aankoop gedaan.
- Geen echte App Store-servercontrole uitgevoerd: daarvoor ontbreken de ingerichte service en IAP-key.

## Primaire bronnen

- [Apple App Store Server Library](https://github.com/apple/app-store-server-library-node): certificaatcontrole, key-inrichting en SignedDataVerifier.
- [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi): actuele transactie- en abonnementsstatus.
- [StoreKit JWS representation](https://developer.apple.com/documentation/storekit/verificationresult/jwsrepresentation-21vgo): native ondertekend aankoopbewijs.
