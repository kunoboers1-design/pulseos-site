# PulseFX iCloud read-only web test

De pagina `/pulsefx/icloud/` kan met deze repository worden gepubliceerd. Zij blijft uitgeschakeld totdat de deployment expliciet is geconfigureerd. De bestaande marketingpagina, login/demo en dashboard blijven hun demofunctie houden. Dit is een aparte, experimentele leesweergave: geen migratie, handelsactie of volledige vervanging van de native app.

## Online activeren na jouw push

1. **Publiceer via de bestaande Cloudflare Pages-configuratie.** Build command: `python3 scripts/build_site.py`. Output directory: `dist`. De map `functions/` moet vanuit de repository worden meegenomen, net als voor de bestaande API-functies. Alleen `dist` op GitHub Pages zetten is niet genoeg: `/api/pulsefx-config` vereist Pages Functions.
2. **Kies de juiste CloudKit-omgeving.** Voor gegevens uit de uitgebrachte native apps kies je `Production` in `iCloud.PulseOS.FX`. `Development` bevat een andere dataset. De website schakelt nooit automatisch tussen beide.
3. **Maak in die omgeving een browser-API-token aan.** Voorgestelde naam: `PulseFX Web Read Test`. Kies callback **Post Message**, Allowed Origins **Only the following domain(s)**, en vul het exacte domein in waarop je gaat testen, bijvoorbeeld `pulseos.eu` achter de HTTPS-prefix. Laat discoverability uit. Geen server-to-server key en geen gewone Sign in with Apple Services ID. Gebruik geen `Any Domain`.
4. **Stel de onderstaande variabelen in op de betreffende Cloudflare Pages-deployment.** Het API-token is bedoeld voor de browser en wordt aan die browser geleverd; het is geen geheime serversleutel. Sla gebruikerssessietokens of Apple-wachtwoorden nergens in de deploymentconfiguratie op.
5. **Deploy opnieuw zodat de variabelen actief zijn.** Open `https://pulseos.eu/pulsefx/icloud/` als dit het ingestelde domein is. Controleer de getoonde omgeving, klik **Start iCloud test**, log zelf in via Apple, kies de PulseFX-zone en klik **Read selected zone**.

| Cloudflare Pages-variabele | Waarde |
| --- | --- |
| `PULSEFX_CLOUDKIT_ENABLED` | `true` |
| `PULSEFX_CLOUDKIT_ORIGIN` | `https://pulseos.eu` — of de exacte andere HTTPS-origin, zonder trailing slash of pad |
| `PULSEFX_CLOUDKIT_ENVIRONMENT` | `production` voor uitgebrachte-appdata, anders expliciet `development` |
| `PULSEFX_CLOUDKIT_API_TOKEN` | Het browser-API-token uit exact dezelfde CloudKit-omgeving |

Een preview-URL van Cloudflare Pages heeft een andere origin dan `pulseos.eu`. Configureer token en deployment daarvoor afzonderlijk of test op het ingestelde domein. Hetzelfde geldt voor `www.pulseos.eu`. Zonder alle geldige variabelen of bij een verkeerde origin levert de configfunctie geen token en blijft de knop uitgeschakeld.

## Wat je kunt vergelijken

- Accounts, opgeslagen saldo en valuta, archiefstatus en gekoppelde trade-aantallen.
- Oude `CD_Trade`-records én moderne `CD_OpenTrade`-records, inclusief gesloten moderne trades.
- Filters op account, status en recordtype; details per account; handmatig vernieuwen.
- Ontbrekende koppelingen, onbekende velden, asset-opslag en queryfouten via **Data checks**.

De oude relatie gebruikt een CloudKit-recordnaam, de moderne relatie een UUID. Er wordt niet op instrument of datum gededupliceerd. Saldi worden niet herberekend uit trades en verschillende valuta worden niet opgeteld.

Deze eerste webtest toont **niet alle PulseFX-inhoud**: losse notities, rich text, foto's, screenshots, alerts, instellingen en kapitaalmutaties zijn niet opgenomen. Er zijn geen live koersen, balansgrafieken, Pro-controles of schrijfknoppen. Een afgeronde query bewijst niet dat alle apparaten synchroon zijn. Vergelijk per account de bedragen en beide tradegeneraties met de native app.

## Grenzen en fouten

- De testpagina is publiek bereikbaar; de gebruikersrecords vereisen Apple CloudKit-authenticatie. Een geheime URL is geen toegangsbeveiliging.
- De code bevat alleen leesoperaties. Een fetch-allowlist blokkeert onder andere recordwrites, zonewrites, subscriptions, assets-upload en andere omgevingen. Dit maakt een Apple-gebruikerssessie niet tot een servermatig afgedwongen read-only credential.
- Apple JS wordt uitsluitend geladen na **Start iCloud test**. De applicatie gebruikt geen lokale/persistente opslag voor de opgehaalde records of sessietokens en geen analytics. Apple's eigen loginflow valt onder Apple. De configuratiefunctie ontvangt geen accounts, trades of Apple-inloggegevens.
- `persist: false`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, CSP en veilige DOM-tekstrendering zijn ingesteld voor de testpagina. De SDK-logger is uitgeschakeld. De applicatie toont vaste foutcodes, geen ruwe SDK-responses met mogelijke privédata.
- Per run: maximaal 100 pagina's, 10.000 records, 60 seconden en maximaal 15 seconden per request. Eén zone per run. Bij limieten of fouten worden resultaten herkenbaar gedeeltelijk; valuta-totalen worden dan niet getoond. Mislukt een refresh na een complete run, dan blijft de vorige fetch zichtbaar als **stale**.
- Bij afmelden, sessieverval, accountwisseling of verlaten van de pagina worden records uit geheugen en DOM gewist. Late responses worden genegeerd. Opnieuw verbinden vereist een schone herlaadactie. Dit is geen garantie over browserdiagnostiek of de opslag van Apple zelf.
- Queries gebruiken het bestaande `CD_entityName`-veld. Bij een schema-/indexfout stopt de betreffende query met een melding; de website maakt geen index of recordtype aan. Pas niet automatisch het schema aan om een fout te verbergen.
- Een lege zone betekent niet dat je native gegevens zijn verdwenen. Controleer omgeving, gekozen zone, Apple-account en native synchronisatie. Herstel of verwijder niets op basis van deze test.

## Lokaal controleren

```sh
node --test tests/pulsefx-cloudkit/*.test.mjs
node scripts/test_pulsefx.mjs
python3 scripts/build_site.py
python3 scripts/test_public_output.py
PLAYWRIGHT_PATH=/path/to/existing/playwright node scripts/test_pulsefx_icloud_browser.mjs
```

De browsertest onderschept alle netwerkrequests en gebruikt uitsluitend fictieve records en een SDK-testdouble. Een optionele `PULSEFX_VENDOR_SDK_PATH` kan wijzen naar een lokaal exemplaar van Apple's officiële SDK voor een extra sign-in-knoptest met een onderschepte authresponse. Deze tests bewijzen geen echte Apple-login of Production-compatibiliteit.

Een gewone lokale HTTP-preview toont de uitgeschakelde/niet-geconfigureerde pagina. Er is geen lokale certificaatinstallatie nodig om deze versie te bouwen en online via HTTPS te testen. Er zijn geen credentials, echte data of SDK-kopieën in Git opgenomen; fixtures staan buiten de productiebuild.

## Uitschakelen

Zet `PULSEFX_CLOUDKIT_ENABLED=false` en deploy opnieuw. Nieuwe paginaladingen ontvangen dan geen token; open sessies moeten zelf afmelden/sluiten. Voor intrekken van het nieuw aangemaakte testtoken gebruik je de CloudKit-console. Wijzig geen bestaande apprechten, records, zones of schema's als onderdeel hiervan.

## Bronnen

- [Apple CloudKit JS](https://developer.apple.com/documentation/cloudkitjs)
- [Apple API-tokenauthenticatie en callback](https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/SettingUpWebServices.html)
- [performQuery en pagination](https://developer.apple.com/documentation/cloudkitjs/cloudkit.database/performquery)
- [Core Data-records lezen](https://developer.apple.com/documentation/coredata/reading-cloudkit-records-for-core-data)
