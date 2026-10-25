# PulseFX vriendenworkspace — 25 oktober 2026

## Gebouwd en lokaal getest

- Eén ingelogde workspace met tabs Accounts, Stats, Notes, Open trades, Journal en Connection. Tabwisseling herlaadt de pagina niet. Toetsenbordbediening en layouts van 320 tot 1440 pixels, donker/licht, zijn gecontroleerd.
- Accounts tonen opgeslagen saldo per valuta, archiefstatus, details en een gefilterd journal. Geen som van verschillende valuta.
- Stats gebruikt de bestaande native-pariteitscalculator lokaal, zonder aankoopclaim of verzending naar de Premium-server. De afzonderlijke Premium-servercode blijft bestaan voor later; de vriendenworkspace roept die niet aan.
- Notes leest `CD_TradeNote` (`CD_title`, `CD_body`, account-/trade-UUID en datum), plus pre-/postnotities van moderne trades. Alleen platte tekst, veilig via DOM textContent. Geen RTF, foto’s of asset-downloads. Ontbrekende query-index/veldondersteuning verschijnt als onvolledige notitielezing; complete account/tradestatistieken blijven bruikbaar.
- Open trades gebruikt de geladen `CD_Trade` en `CD_OpenTrade` records en accountkoppelingen. Geen fictieve fallback bij echte data. De gebruiker noemde een native trade van vandaag met 1,24 lot; die is niet in deze uitvoering uit productie gelezen of gesloten.
- Configuratie wordt nu met de bestaande same-origin friends-cookie opgevraagd. Dit repareert de oude `credentials: omit`-aanvraag achter de wachtwoordpoort.
- Lokale volledige demo: `http://127.0.0.1:8766/pulsefx/icloud/?workspace=demo`. Eén dataset voor alle tabs; demo sluiten verandert saldo, open posities, journal en statistieken samen. Reset herstelt de fixtures. Geen browseropslag van handelsgegevens.

## Sluiten: geïmplementeerde pilot, nog niet live geactiveerd

De standaard blijft read-only. `PULSEFX_CLOSE_TRADE_PILOT_ID` kan één bestaande moderne trade-UUID aanwijzen, na identificatie en expliciete activering voor een gecontroleerde proef. Geen instelling is nu toegevoegd, geen websiteversie is in deze uitvoering gedeployed en geen native/CloudKit-data is gewijzigd.

De sluitflow valideert status, unieke identiteit, actieve en eenduidige accountkoppeling, volledig/niet-stale snapshot, bedrag, datum en optionele final R. Het venster toont het saldo vóór/na en vereist een bewuste bevestiging. P&L wordt door de gebruiker ingevoerd, niet uit lotgrootte of resultaat geraden. Native break-even met kosten blijft mogelijk.

Voor de write gebruikt `commitClose` één atomische updatebatch met de `recordChangeTag` van zowel `CD_OpenTrade` als `CD_Account`. Alleen status, resultaat, P&L, sluitdatum, optionele final R en accountsaldo veranderen. Geen create, replace, force, delete, relatie- of interne metadatawrites. De transportguard laat maar één exact voorbereide batch door; dit is een clientcontrole, geen beperking van Apples werkelijke sessierechten. De echte Apple JS SDK is offline tegen onderschepte fictieve responses getest: juiste zone, atomic=true en twee updates. Bij conflict/onbekende save-uitkomst wordt niet automatisch opnieuw geprobeerd en moet de workspace opnieuw geladen worden.

Native referentie: `FXLotsizeNotifier/Core/Utilities/TradeEditorPersistence.swift`, `saveClosedTrade`: status/resultaat/P&L/datum en saldo in dezelfde opslagactie; bestaande tradevelden en relaties behouden. Native bronnen zijn uitsluitend gelezen. Legacy trades blijven zichtbaar, maar worden in deze pilot alleen via de native app gesloten.

## Resterende liveproef vóór brede schrijfactivering

1. Publiceer de workspace eerst zonder pilotinstelling. Controleer de bedoelde 1,24-lot trade op account, instrument, openingsdatum, UUID en open status. Niet alleen op lotgrootte selecteren.
2. Controleer dat iOS en Mac zijn bijgewerkt, gesynchroniseerd en dezelfde beginbalans tonen. Maak een actuele herstelbare back-up van de native stores. De oude back-up dekt recente trades niet vanzelf.
3. Activeer alleen de expliciet geselecteerde fictieve testtrade. De gebruiker vult zelf resultaat en werkelijk gewenste test-P&L in het sluitvenster in; het benoemen van een open trade bepaalt die waarden niet.
4. Controleer vóór bevestiging de twee records en het saldo-effect. Laat de gebruiker bevestigen in het venster. Eén save; bij twijfel eerst opnieuw lezen, nooit blind retryen.
5. Vergelijk resultaat/datum/P&L/final R en precies één saldomutatie in web, iOS en Mac, ook na herstart. Controleer parallelle/conflicterende en offline native updates op een aparte fixture voordat breder schrijven wordt vrijgegeven.
6. Verwijder de pilotinstelling wanneer de proef stopt. Een CloudKit-atomische write bewijst geen conflictvrije latere export van een offline native store. Dit blijft de belangrijkste open integratievoorwaarde.

## Bewijs

- 89 unit tests voor access, mapping/reading, statistieken, pilotwrites en de bestaande Premium-service.
- Browserproef: fictieve Apple-responses, live/demodata gescheiden, geen echt netwerk, geen XSS, filters, lege/partiële/stale data, sessiewissel, mobiele layouts, demo-close en echte SDK-serialisatie.
- Publieke build via `scripts/build_site.py` en `scripts/test_public_output.py`; alleen `dist` wordt gepubliceerd.
- Bronnen: [native CloudKit-mapping](https://developer.apple.com/documentation/coredata/reading-cloudkit-records-for-core-data), [batchopties](https://developer.apple.com/documentation/cloudkitjs/cloudkit.database/newrecordsbatch), [update met versiecontrole](https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/ModifyRecords.html), [native synchronisatie](https://developer.apple.com/documentation/technotes/tn3163-understanding-the-synchronization-of-nspersistentcloudkitcontainer).

## App-layout en kleurvoorkeuren — 25 oktober 2026

De webworkspace gebruikt nu Open trades, Accounts, Stats, Notes en Settings. Stats groepeert Overview, Breakdowns, Calendar en Trade journal. Accounts worden op Phase, Funded en Own capital gegroepeerd; zoeken blijft lokaal. Desktop gebruikt een zijbalk, mobiel een vaste onderste tabbar.

Kleuren en vormgeving zijn gebaseerd op de native `Core/Utilities/Theme.swift` (PulseAccentPalette, PulseRadius en systeemtypografie). De zes paletnamen en sleutels blijven gelijk; tekstaccenten hebben aangepaste lichte/donkere tinten voor leesbaarheid. Standaard Forest Green. De keuze staat uitsluitend in browseropslag onder `pulsefx-accent`; geen accountgegevens of tokens worden opgeslagen.

De gelezen native `Core/Stores/AppSettings.swift` gebruikt `NSUbiquitousKeyValueStore.default` met CloudKey.accentColor, geen SwiftData-record. Daarom wordt automatische kleurimport uit CloudKit niet aangeboden. Hiervoor is later een expliciete native brug naar een afgesproken CloudKit-voorkeurrecord nodig, inclusief migratie/conflictbeleid. Native code, cloudschema en clouddata zijn niet gewijzigd.

Gecontroleerd met 89 bestaande unittests en browserproeven voor navigatie, statistieksecties, kleurkeuze/herladen/reset, demo-sluiten en mobiel/licht/donker op 320–1440 px. Dit is een webvertaling van de native vormgeving, geen volledige implementatie van alle native instellingen en statistieksecties.
