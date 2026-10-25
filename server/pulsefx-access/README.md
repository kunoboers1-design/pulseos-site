# PulseFX friends access

Een gedeeld wachtwoord vóór `/pulsefx/app`, `/pulsefx/login`, `/pulsefx/dashboard`, `/pulsefx/icloud` en hun bestanden. De configuratie-API en browserroutes van Premium zijn ook afgeschermd. De marketingpagina `/pulsefx/` blijft openbaar. Native `/api/pulsefx-premium/confirm` behoudt zijn eigen Apple-aankoopverificatie; die route geeft geen browsergegevens terug.

Dit identificeert geen individuele vrienden, vervangt geen iCloud-login en geeft geen Premium-aankoopstatus. De bestaande Premium-controle en read-only CloudKit-code zijn niet verwijderd. Online invoeren/bewerken van trades wordt hiermee niet toegevoegd.

## Voor activering in Cloudflare Pages

Op 25 oktober 2026 is na expliciete toestemming van de gebruiker Production-deployment `49b19224-572d-4478-8832-abcf62c7685b` succesvol uitgevoerd met commit `5f9e4fdece4e94a3f93053f6bf9a09aeaf011a94`. De applicatiecode hiervan is identiek aan de lokaal geteste commit `536aae3`; alleen de documentatie verschilt. Op 25 oktober 2026 is in Safari de aparte D1-database `pulsefx-friends-access` aangemaakt (EU-jurisdictie, database-ID `46469e0e-c39f-4877-9a51-3d92e35c737b`) met beide tabellen en indexen. Pages Production staat op **Fail closed**. De Production-binding `PULSEFX_ACCESS_DB` is in Safari opgeslagen en verwijst naar `pulsefx-friends-access`. De foutieve binding `P` is verwijderd; de database en tabellen zijn behouden. De binding is opgenomen in de nieuwe deployment. Bij de vervolgcontrole na invoer door de gebruiker staan alle drie de variabelen onder Production. De origin is correct (`https://pulseos.eu`). Wachtwoord en sessiesleutel voldeden bij de invoercontrole aan de lengtevereisten en zijn daarna door de gebruiker als **Secret** opgeslagen; beide opslagtypes zijn onder Production geverifieerd. Er zijn geen geheime waarden in dit dossier opgenomen. Onderstaande lijst beschrijft de volledige vereisten. Ontbrekende instellingen sluiten de webapp af (503).

De middleware bundelt succesvol met Cloudflares officiële Wrangler 4.152.0 (`pages functions build`); dit was uitsluitend een lokale build.

De Production-buildinstellingen zijn in Safari opgeslagen en na herladen geverifieerd: build command `python3 scripts/build_site.py`, build output directory `dist`, root directory leeg (repositoryroot). De origin en beide Secret-opslagtypes zijn vervolgens gecontroleerd. De expliciet geautoriseerde herdeployment is daarna succesvol afgerond.

1. Maak een Cloudflare D1-database voor uitsluitend website-toegang, bijvoorbeeld `pulsefx-friends-access`. Voer `server/pulsefx-access/schema.sql` uit in die nieuwe database. Dit raakt CloudKit niet.
2. Koppel de database in het bestaande Pages-project als D1-binding `PULSEFX_ACCESS_DB`.
3. Zet `PULSEFX_FRIENDS_ORIGIN` op de exacte HTTPS-origin, bijvoorbeeld `https://pulseos.eu`, zonder afsluitende slash.
4. Voeg **secrets** toe in Cloudflare, niet in Git of chat:
   - `PULSEFX_FRIENDS_PASSWORD`: een uniek sterk gedeeld wachtwoord van 16–256 tekens.
   - `PULSEFX_FRIENDS_SESSION_SECRET`: een willekeurige sleutel van minstens 32 tekens; bijvoorbeeld lokaal gegenereerd met `openssl rand -hex 32`.
   - Zet `PULSEFX_FRIENDS_LOCAL_PREVIEW` **niet** in Cloudflare. Het lokale testwachtwoord is publiek en mag nooit voor de echte website worden gebruikt.
5. Zet onder Pages Settings → Runtime → Fail open/closed op **Fail closed**, vóór deployment. Anders kan Cloudflare bij uitgeputte Functions-quota statische bestanden buiten de middleware om serveren. Gebruik geen Cache Everything-regel voor de beschermde routes en behoud de rootmiddleware voor alle routes.
6. Controleer de deploymentpipeline: Pages Functions moet `functions/_middleware.js` met de import uit `server/` bundelen. Alleen `dist/` statisch uploaden is onvoldoende. Gebruik de bestaande Git-integratie met projectroot en `dist` als output.
7. Maak bij voorkeur een aparte preview-D1-binding en previewsecrets met de exacte testorigin. Ongeconfigureerde `pages.dev`-origins blijven dicht. Oude deployments bevatten nog geen gate: controleer en beperk hun bereikbaarheid via Cloudflare-toegangsinstellingen voordat je dit als besloten omgeving deelt.
8. Na expliciet geautoriseerde deployment: test in een privévenster dat directe app-, JS- en API-URLs afgeschermd zijn; verkeerd wachtwoord, goed wachtwoord, uitloggen en herladen. Controleer daarna je bestaande iCloud-leesflow. Er zijn hier geen CloudKit-schrijfacties toegevoegd.

De instellingen staan los van de bestaande `PULSEFX_CLOUDKIT_*`-variabelen. Voor een tweede toegestane origin is een afzonderlijke deploymentconfiguratie en database nodig. Een extra Node/Render-server is niet nodig voor deze toegangspoort; Cloudflare Functions en D1 voeren wel serverwerk uit en zijn onderhevig aan hun accountquota/prijzen.

## Sessies en beheer

- Opaque willekeurige cookie, HttpOnly, Secure, SameSite=Strict; maximaal twaalf uur. Alleen een HMAC van de cookie wordt opgeslagen.
- Wachtwoord- of sleutelaanpassing maakt bestaande sessies ongeldig zodra de nieuwe configuratie actief is. Deel een nieuw wachtwoord om toegang in te trekken.
- Tien pogingen per IP per vast kwartier; tellers bevatten alleen een keyed hash, geen rauwe IP-adressen. In een gedeeld netwerk delen vrienden deze limiet. Dit is geen DDoS-bescherming.
- Verlopen sessies/tellers worden bij volgende inlogpogingen opgeruimd; geldigheid wordt bij iedere beschermde aanvraag gecontroleerd.
- `Lock website` verwijdert de toegangssessie uit de database en browser. Reeds geladen informatie in een ander tabblad verdwijnt niet automatisch. Sluit zulke tabbladen en verbreek de Apple-verbinding afzonderlijk wanneer je een gedeelde computer verlaat.
- Geen login-overzicht met namen, geen analytics-events, geen wachtwoordlogging. Cloudflare verwerkt het netwerkverkeer volgens zijn eigen voorwaarden.

## Lokale controle

Node 24+ (voor de tijdelijke SQLite-testadapter):

```sh
python3 scripts/build_site.py
node --test tests/pulsefx-access/*.test.mjs
node scripts/preview_pulsefx_friends.mjs
```

Open `http://127.0.0.1:8767/pulsefx/icloud/?statistics=demo#premium-statistics` met testwachtwoord `pulsefx-friends-preview`. Deze preview gebruikt uitsluitend tijdelijke geheugenopslag en blokkeert echte Apple/Premium-configuratie. Herstart wist sessies. Het HTTP-cookie is uitsluitend toegestaan op expliciet geconfigureerde loopback-preview; productie vereist HTTPS.

Browsercontrole:

```sh
PLAYWRIGHT_PATH=/pad/naar/playwright node scripts/test_pulsefx_friends_browser.mjs
```

Referenties: [Pages middleware](https://developers.cloudflare.com/pages/functions/middleware/), [bindings en secrets](https://developers.cloudflare.com/pages/functions/bindings/), [routing en fail closed](https://developers.cloudflare.com/pages/functions/routing/).

## Livecontrole 25 oktober 2026

- Marketing en wachtwoordpagina: HTTP 200.
- App, dashboard, iCloud-pagina en iCloud-script zonder sessie: HTTP 303 naar toegangsscherm.
- Configuratie- en Premium-status-API zonder sessie: HTTP 401.
- Eén bewust verkeerd testwachtwoord: HTTP 401 met verwachte foutmelding.
- `pulseos-site.pages.dev/pulsefx/icloud/`: HTTP 503 wegens niet-toegestane origin.
- Broncodepad `/server/pulsefx-access/gate.mjs` levert de publieke homepagefallback, geen serverbroncode.
- Succesvolle live-login in Safari geverifieerd na wachtwoordinvoer door de gebruiker; de werkruimte bleef bereikbaar na herladen. Daarna via `Lock website` → `Lock this browser` uitgelogd. Rechtstreeks opnieuw openen van `/pulsefx/icloud/` verwees weer naar het wachtwoordscherm. Safari is uitgelogd achtergelaten.
- Geen Apple-login uitgevoerd en geen CloudKit-data gelezen of gewijzigd tijdens deze test. Oude deployment-URLs zijn hiermee niet afzonderlijk afgeschermd of geaudit.
