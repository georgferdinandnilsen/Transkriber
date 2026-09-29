# Transkriber på nett

Transkriber som nettside. Den tar opp intervjuer og gjør lyd om til tekst, helt lokalt i nettleseren. Lagt på hjemskjermen oppfører den seg som en vanlig app.

Laget av Georg Ferdinand Nilsen · georgferdinandnilsen@gmail.com

## Legg nettsiden ut på GitHub

Du trenger en gratis konto på github.com. Nettsiden blir liggende på en adresse som `https://BRUKERNAVN.github.io/transkriber/`.

### Første gang

1. Logg inn på [github.com](https://github.com). Trykk **+** øverst til høyre og velg **New repository**.
2. Skriv `transkriber` som navn, velg **Public**, og trykk **Create repository**.
3. Trykk på lenken **uploading an existing file** på siden som kommer opp.
4. Åpne mappen `Transkriber-web` i Finder. Merk alt som ligger i den (⌘A) og dra det inn i nettleservinduet. Mappene `css`, `js` og `icons` må være med.
5. Vent til alle filene er lastet opp, og trykk **Commit changes** nederst.
6. Gå til **Settings**, og velg **Pages** i menyen til venstre.
7. Under **Build and deployment**, **Source**: velg **Deploy from a branch**. Under **Branch**: velg **main** og **/ (root)**, og trykk **Save**.
8. Vent et par minutter og last siden inn på nytt. Øverst står adressen, for eksempel `https://BRUKERNAVN.github.io/transkriber/`.

Sjekk at `index.html` ligger rett i repoet, ikke inne i en mappe. Ligger den i en mappe, er adressen feil.

### Når du oppdaterer appen

1. Åpne repoet på github.com og trykk **Add file** og **Upload files**.
2. Dra inn filene som er endret. Filer med samme navn blir byttet ut.
3. Trykk **Commit changes**. Etter et minutt eller to er den nye versjonen ute.

Appen henter alltid nyeste versjon når du er på nett, og bruker den lagrede når du er uten nett.

### Med Terminal (valgfritt)

```
cd ~/Documents/Transkriber-web
git init
git add .
git commit -m "Transkriber på nett"
git branch -M main
git remote add origin https://github.com/BRUKERNAVN/transkriber.git
git push -u origin main
```

Slå deretter på Pages som i steg 6 og 7 over.

## Legg appen på hjemskjermen

- **iPhone og iPad (Safari):** åpne adressen, trykk Del-knappen og velg **Legg til på Hjem-skjerm**.
- **Android (Chrome):** åpne adressen, trykk menyen (⋮) og velg **Installer app** eller **Legg til på startskjermen**.
- **Mac og PC (Chrome eller Edge):** trykk installer-ikonet i adressefeltet.

Appen åpner seg da i eget vindu, uten adressefelt.

## Slik virker den

Alt fra Mac-appen er med: opptak i runder med nedtelling, pause og flagg, utkast, transkribering av opptak og lydfiler, personer med navn, oppsummering, AI-titler, egne titler og filnavn med tidspunktet først.

| Tast under opptak (tastatur) | Hva skjer |
|---|---|
| Mellomrom | Pause, og fortsett igjen |
| Enter | Ny runde |
| Pil opp | Flagg, blir til 🚩 i teksten |

### Modeller

Modellen lastes ned første gang du transkriberer, og lagres i nettleseren.

| Modell | Passer til |
|---|---|
| NB-Whisper Small | Anbefalt for norsk på datamaskin |
| NB-Whisper Base | Norsk på mobil. Raskere og mindre |
| Whisper Small | Engelsk |
| Turbo | Best på engelsk. Krever datamaskin med WebGPU |

### Lagring av filer

- **Chrome og Edge på datamaskin:** velg en mappe under **Lagres i**. Da lagres lyd, tekst og oppsummering der av seg selv, som i Mac-appen, og filene får nytt navn når du endrer tittelen. Etter omstart av nettleseren må du trykke **Gi tilgang igjen**.
- **iPhone, Android, Safari og Firefox:** trykk **Lagre …** på et opptak og velg hva du vil lagre. På iPhone åpnes delingsarket. Velg **Arkiver i Filer** for å bestemme mappen.

Opptakene ligger også i nettleseren. Appen ber om at de ikke slettes, men nettleseren kan likevel rydde bort gamle data hvis enheten får lite plass. Lagre det du vil beholde.

### Forskjeller fra Mac-appen

- **Opptak på telefon:** hold skjermen på og appen åpen. Telefonen stopper opptaket hvis du bytter app eller låser skjermen.
- **Minivindu:** finnes i Chrome og Edge på datamaskin. Trykk **Minivindu** under opptaket. Det dukker ikke opp av seg selv når du bytter app, slik som på Mac.
- **Personer:** nettversjonen skiller mellom opptil 3 personer.
- **Oppsummering og titler:** slå på **Oppsummering og titler med AI** i innstillingene. Da lastes en AI-modell på ca. 1 GB ned én gang. Det krever WebGPU og ca. 2 GB ledig grafikkminne, så det virker best i Chrome eller Edge på datamaskin. På nyere iPhone med iOS 26 kan det virke, men telefonen kan gå tom for minne. AI-en er mindre enn Apple Intelligence, så oppsummeringene blir enklere.
- **Språk:** velg norsk eller engelsk. Nettversjonen kan ikke oppdage språket selv.
- **Lange opptak:** personer skilles bare i opptak under 25 minutter. Del lange intervjuer opp med **Ny runde**.

### Personvern

Lyden og teksten forlater aldri enheten. Nettsiden henter bare selve programmene fra nettet: Whisper-modellene fra Hugging Face og bibliotekene fra jsDelivr. Det skjer første gang, og deretter virker appen uten nett.

## Filene i mappen

| Fil | Hva den gjør |
|---|---|
| `index.html` | Selve siden |
| `css/app.css` | Utseendet, med lys og mørk modus |
| `js/app.js` | Skjermene og det du trykker på |
| `js/recorder.js` | Opptak i runder, flagg og lydnivå |
| `js/worker.js` | Whisper og stemmegjenkjenning, i bakgrunnen |
| `js/text.js` | Tekst, personer, filnavn og fjerning av falske linjer |
| `js/files.js` | Lagring i mappe og «Lagre …» |
| `js/ai.js` | Oppsummering og titler |
| `js/mini.js` | Minivinduet |
| `js/store.js`, `js/audio.js`, `js/models.js` | Lagring i nettleseren, lyd og modellvalg |
| `sw.js`, `manifest.webmanifest`, `icons/` | Det som gjør siden til en app på hjemskjermen |
