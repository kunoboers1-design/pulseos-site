# Appupdates per e-mail

De automatische pop-up is vervangen door een vast formulier bij de footer. Op een apppagina is alleen die app vooraf geselecteerd; nieuwe appaankondigingen zijn een afzonderlijke keuze. Op de homepage selecteert de bezoeker zelf de onderwerpen. De keuzes worden toegevoegd aan afzonderlijke Brevo-lijsten. Er worden geen contacten afgemeld of blokkeringen opgeheven.

## Huidige status

De interface, API-routering en lokale mailopmaak zijn gereed. De nieuwe Brevo-lijsten en Cloudflare-instelling moeten vóór publicatie worden ingesteld. Automatische releaseherkenning en het versturen van campagnes zijn nog niet geactiveerd. De lokale Python-preview voert de Cloudflare-functie niet uit; daarmee is geen echte aanmelding getest.

## Brevo instellen

Maak één afzonderlijke lijst per app en één lijst voor nieuwe appaankondigingen. Zet de echte numerieke lijst-ID's in de Cloudflare Pages-omgevingsvariabele `BREVO_TOPIC_LIST_IDS`, als JSON met deze sleutels:

- `pulsefx`, `pulsevinyl`, `pulserecipes`, `pulsesidequest`
- `pulsereflect`, `pulsewiish`, `pulselift`, `pulsehabits`
- `releases`

Gebruik verschillende lijst-ID's; zo ontvangt iemand alleen de gekozen onderwerpen. Bewaar de bestaande `BREVO_API_KEY` als geheim. `BREVO_LIST_ID` blijft beschikbaar voor oudere, gecachte formulieren. De API meldt een fout als een geselecteerd onderwerp nog geen geldige lijst heeft; een ontbrekende koppeling wordt niet als succesvolle aanmelding gepresenteerd.

Bestaande algemene contacten krijgen niet automatisch een appvoorkeur. Houd de oude lijst afzonderlijk; verzend appupdates naar de specifieke applijst. Brevo voegt via `listIds` lidmaatschappen toe en behoudt bestaande lijstlidmaatschappen. Nieuwe formulieren overschrijven het oude PREFERENCES-attribuut niet.

## Een update-mail voorbereiden

Vul voor een werkelijk gepubliceerde versie een JSON-bestand in met `app`, `version`, `intro`, `changes` en `appStoreUrl`. Gebruik gecontroleerde releasenotities. Het meegeleverde voorbeeld is expliciet een oudere PulseFX-release en geen actuele aankondiging.

```sh
node scripts/render-update-email.mjs email-updates/pulsefx-example.json email-updates/pulsefx-preview.html
```

De generator schrijft HTML en een tekstversie. Hij verstuurt niets en maakt geen externe campagne. Maak vervolgens in Brevo een e-mailcampagne met uitsluitend de lijst van die app als ontvangers, plak de HTML in de HTML-editor en controleer onderwerp, afzender, inhoud en App Store-link. Gebruik de ingebouwde campagnestroom voor afmelden; de template bevat `{{ unsubscribe }}`.

Voor een echte release moet `example` ontbreken of `false` zijn. Controleer dat de genoemde versie daadwerkelijk beschikbaar is voor de beoogde ontvangers. De keuze tussen handmatig goedgekeurde concepten en volledig automatische verzending is nog open.

## Bronnen

- [Brevo: contacten en lijsten](https://developers.brevo.com/docs/synchronise-contact-lists)
- [Brevo: e-mailcampagne maken](https://developers.brevo.com/reference/create-email-campaign)
- [Brevo: afmeldlink](https://help.brevo.com/hc/en-us/articles/209553645-Insert-a-custom-unsubscribe-link-in-your-emails)
