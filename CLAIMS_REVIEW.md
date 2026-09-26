# Lokale controle van websiteclaims

## Scope en bewijs

Deze wijziging gebruikt het aangeleverde bestand dat begint met “Werk uitsluitend in het websiteproject”. Alleen het websiteproject is aangepast. Appcode is niet geopend of gewijzigd. Er is niets gecommit, gepusht of gedeployd.

Het bestand beschrijft een lokale code-audit, geen bevestiging van uitgebrachte functionaliteit. De drie genoemde auditrapporten met bronregels en releasekoppelingen waren niet bijgevoegd. De melding dat FX- en Vinyl-listings eerder zijn gelezen, bevat geen concrete koppeling van iedere nieuwe functie aan een uitgebrachte build. Daarom zijn bestaande claims beperkt of gecorrigeerd en zijn nieuwe lokale mogelijkheden niet als live toegevoegd.

De bestaande website is uitsluitend gebruikt om vast te stellen wat al werd geclaimd, niet als onafhankelijk releasebewijs. Ook de bestaande changelog is niet gebruikt om nieuwe lokale functies alsnog als uitgebracht aan te merken.

## Wijzigingen

| App | Correcties aan bestaande publieke tekst |
| --- | --- |
| PulseFX | Gedetailleerd tradejournal als Pro omschreven; geen zelfstandige account-Notes meer. Notes-previewknop verwijderd. Berekeningen en de MetaTrader-link impliceren geen trade-uitvoering. Dagelijkse melding verduidelijkt als optionele R/R-notificatie. Widgetclaim beperkt tot de laatst berekende lotgrootte. |
| PulseVinyl | Beschikbaarheid omschreven als release-matches, niet winkelvoorraad. Waardes zijn schattingen afhankelijk van beschikbare gegevens. Radar gebruikt alleen “Explore Release Radar for music discoveries.” Geen fysieke pre-orders, artiestenbron of gegarandeerde alerts. Basiswaarde en Radar verwijderd uit de exclusieve Pro-prijskaarten. Barcode toevoegen valt onder planlimieten. |
| PulseRecipes | Import beperkt tot ondersteunde pagina’s en beschikbare brongegevens, met controle vóór opslaan. Voedingswaarden zijn opgeslagen/geïmporteerde gegevens die per portie worden geschaald. Recept-gegenereerde boodschappenlijsten consequent als Premium aangeduid, ook bij Highlights, How it works, Description en de lifetime-kaart. |
| PulseReflect | Vrij schrijven, onbeperkte willekeurige entries, ochtend/avondmodi en zelfstandige mood-trackingclaims verwijderd. Tekst beperkt tot geplande begeleide reflecties, antwoorden, geschiedenis, Year in Pixels, wekelijkse terugblik en consistentie. De lifetime-kaart belooft niet langer alle functies; niet bevestigde Premium-details zijn niet ingevuld. |
| PulseWiish | Geen belofte van import uit iedere winkel of URL. “Every feature included” verwijderd. In bestaande releasebeschrijvingen: widgets beperkt tot Home Screen; Buy Together omschreven als registratie van bijdragen via iCloud met verversen, zonder geld te verzamelen, bewaren of overmaken. Geen realtimegarantie. |
| PulseSideQuest | Exact aantal verwijderd, geen vervanging door 92. Geen onbeperkte Quest Studio-capaciteit of nieuwe exacte Queue-limiet. JSON-export omvat records/notities, niet fotobestanden. Live Activities en meldingen zijn afhankelijk van ondersteuning/toestemming. |
| PulseLifts | Paused behouden en zichtbaar gemaakt in intro, metadata, prijsgedeelte en appoverzichten. Geen impliciete aankomende release. Ontwikkelfuncties uitdrukkelijk als development build beschreven. 1RM- en apparatuurfilterclaims verwijderd. Historie/grafieken/vergelijkingen vereisen Premium in die ontwikkelbuild. |
| PulseHabits | In development behouden in intro, metadata en prijsgedeelte. Beschreven functies hebben expliciet betrekking op de ontwikkelbuild; functies en planlimieten kunnen veranderen. |

Numerieke Free/Pro-capaciteiten (zoals 5 accounts, 10 Owned/Wanted en 20 recepten/items) en niet onderbouwde proefperiodeclaims zijn uit de actieve productcopy gehaald. De CSV-prijzen, aankoopopties, regiokeuze en uitleg over mogelijk verouderde websiteprijzen zijn behouden. Geen capaciteit of prijs uit codefallbacks toegevoegd.

De bestaande vormgeving, HTML-sectie-indeling en uitklapbare featurekaarten blijven behouden. Featuretekst is compacter. De homepage, About en verwante-appsamenvattingen gebruiken dezelfde gecorrigeerde Reflect-/FX-omschrijving en Paused-status. Er zijn geen bestaande FAQ-secties gevonden; er is geen nieuwe FAQ verzonnen.

## Niet toegevoegd zonder releasekoppeling

| App | Voorbeelden van lokale claims die buiten nieuwe live-copy blijven |
| --- | --- |
| PulseFX | Vast risicobedrag als aparte invoermodus; demoaccounts; expliciete open/closed-tradefunctionaliteit; strategie-/psychologievelden; exacte basisrecording- versus journallimieten; terugkerende reminders; nieuwe iPad-claim. |
| PulseVinyl | Full Rescan; uitgebreide collectie-inzichten als aparte Pro-feature; conditie- en aankoopdetails; nieuwe Pro-labels voor persoonlijke notities; een nieuwe marketingclaim over valutakeuze. De precieze Radar-artiestenbron, recente/toekomstige Apple Music-releases en release-day alerts blijven volledig buiten de copy. |
| PulseRecipes | OCR/import van recepttekst uit foto's; gratis handmatige shopping checklists als nieuw beschreven feature; vijf extra foto's; automatisch samenvoegen van gelijke ingrediënten; nieuwe exacte sorteeropties en planlimieten. |
| PulseReflect | Scorevragen en score-overzichten als nieuwe expliciete functies; zelf vragen aanpassen, antwoordtype 1–10 en verplichte vragen; vijf vragen per level; maand-/kwartaal-/jaarlevels; onbeperkte custom vragen; optionele iCloud-sync als nieuwe feature; Monday insights digest. |
| PulseWiish | OCR-uitbreiding van bestaande items; nieuwe thema’s Standard/Ember/Aurora/Rose/Forest en hun planindeling; exacte definitie van niet-verwijderde items. |
| PulseSideQuest | 92 quests; vijf Queue-items; exacte tijdsbudgetten 5/15/30 minuten; nieuwe exacte moodlabels en alle instelbare Quest Studio-velden. |
| PulseLifts / PulseHabits | Geen van de beschreven ontwikkelfuncties wordt als uitgebracht gepresenteerd. Er is geen lancering, beschikbaarheidsdatum of definitieve prijs toegevoegd. |

PulseReflect 1.1.0 (27 september 2026) brengt scorevergelijking over tijd uit als Premium-functie; de overige Reflect-punten hierboven blijven voorbehouden.

PulseWiish 1.2.0 (26 september 2026) heeft PDF-/CSV-export, spaargeschiedenis en deposit tracking en smart collections als Pro-functies uitgebracht; die staan daarom niet meer op deze lijst.

Vervolgverificatie vraagt per claim een concrete uitgebrachte versie/build en controle van die publieke versie. Een lokale route of Pro-gate alleen is daarvoor onvoldoende. Bovenstaande lijst is een releasevoorbehoud, geen aankondiging van toekomstige functionaliteit.

## Afzonderlijke privacy- en changelogcontrole

### Privacy

- Reflect en Wiish bevatten brede claims dat alle data lokaal blijft. Het aangeleverde bestand maakt die formulering onzeker, en Wiish noemde op dezelfde pagina al iCloud bij Buy Together. De brede productclaims zijn verwijderd en vervangen door een gewone verwijzing naar de bestaande PulseOS Privacy Policy. Er zijn geen nieuwe ongeverifieerde opslag-, sync-, tracking- of beveiligingsclaims toegevoegd.
- De centrale privacyverklaring en de overige privacysecties zijn niet inhoudelijk herschreven of opnieuw goedgekeurd. De oorspronkelijke privacyclaims van onder meer FX, Recipes, Vinyl en SideQuest blijven een aparte release-/gegevensstroomcontrole vereisen. Vooral Recipes combineert iCloud met brede lokale-opslagtaal; dit rapport is geen bevestiging van die tekst.

### Changelogs

- Bestaande versienummers en bijbehorende datums zijn programmatisch vergeleken met de snapshot vóór deze wijziging en behouden. Er zijn geen nieuwe release-items of datums toegevoegd.
- Alleen bestaande onjuiste/te stellige details zijn beperkt: FX-contract-sizeclaim verwijderd; Vinyl Radar ook historisch neutraal; Recipes geen “any website” of ongekwalificeerde shopping-generatie; Reflect geen free-writing/mood-tracking/local-only-releaseclaims; Wiish geen Lock Screen- of realtime-/geldinzamelingssuggestie.
- De overige historische regels zijn behouden, niet onafhankelijk geverifieerd. Het verwijderen of beperken van tekst bewijst niet dat de nieuwe lokale auditfuncties bij die historische versie horen.

## Bestanden

- Acht apppagina’s: `pulsefx/index.html`, `pulsevinyl/index.html`, `pulserecipes/index.html`, `pulsereflect/index.html`, `pulsewiish/index.html`, `pulsesidequest/index.html`, `pulselift/index.html`, `pulsehabits/index.html`.
- Samenvattingen: `index.html`, `about/index.html`, `also-by.js` (alleen copy/status; de bestaande insertielogica is ongewijzigd).
- Controles: `scripts/test_claims.py` en `scripts/test_claims_browser.mjs`; `scripts/test_public_output.py` controleert nu ook dat dit rapport buiten `dist/` blijft.
- Dit rapport: `CLAIMS_REVIEW.md`; het lokale buildscript neemt dit bestand niet op in `dist/`.

## Controles en lokale preview

```sh
python3 scripts/test_claims.py
python3 scripts/build_site.py
python3 scripts/test_public_output.py
python3 scripts/test_prices.py
node scripts/test_claims_browser.mjs
node scripts/test_pricing_browser.mjs
```

Voor Playwright en lokale serverinstellingen: zie `PRICING.md`. De preview draait op `http://127.0.0.1:8765/` vanuit de statische `dist/`-uitvoer.

- Claimcontroles: acht apppagina’s, neutrale Radar, juiste onderscheidingen rond Pro/Premium, geen nieuwe lokale functies als live, correcte ontwikkelstatussen.
- Behoudcontrole tegen de snapshot vóór deze beurt: `data/prices.json`, `pricing.mjs` en `site-pages.css` byte-identiek; prijsbindings, prijsdisclaimers, App Store-links en historische versielabels behouden.
- Vier bestaande Python-prijstests slagen. De 1.575 consumentenprijzen blijven onveranderd.
- Lokale productiebuild: 110 statische bestanden. Publieke output bevat geen CSV-exports, opbrengstvelden, uitgesloten lifetime offer of auditrapport. Alle lokale HTML-assetverwijzingen resolven.
- Browsercontrole geslaagd: alle acht apppagina’s op desktop (1440 px) en mobiel (390 px), uitklappen met het toetsenbord, sectielinks, directe links naar How it works en ontwikkelingstatus. Featuresecties zijn vastgelegd en visueel nagekeken. Bij lange sectiescreenshots is alleen de vaste header in de screenshot verborgen, om de tekst te kunnen bekijken; de website-CSS is daarvoor niet aangepast.
- Prijsregressie geslaagd: de bestaande suite controleert zoeken/kiezen, valuta, opslag, tabbladen, herladen, navigatie, ontbrekende data en mobiele tikbediening. Bestaande fouten hieronder worden apart gerapporteerd.

### Bestaande beperkingen

- `also-by.js` heeft een bestaande `insertBefore`-fout op apppagina’s. Alleen de samenvatting/status is gewijzigd; de insertielogica is niet gerepareerd. Tests rapporteren deze fout afzonderlijk.
- De homepage meet 400 px breed op een viewport van 390 px. Dit is met zowel de nieuwe als de oorspronkelijke HTML gereproduceerd; de bestaande decoratieve telefoonbeelden lopen iets uit. Apppagina’s hebben geen horizontale overflow in de controle. Geen redesign of nieuwe CSS toegevoegd.
- Geen publieke appbinaries, Safari, fysiek iPhone-toetsenbord, VoiceOver, Cloudflare Functions of live releasegegevens getest. Deze lokale preview is geen releaseverificatie of publicatie.
