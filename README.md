# Suparkompisen

Personlig promille-logg byggd i Angular 18, med en valbar social läge för att följa kompisarnas kvällar i realtid.

Appen kommer i två smaker som delar samma kodbas:

| Smak | URL | Vad är det |
|------|-----|-------------|
| **Offline-kalkylatorn** | https://elarsson.github.io/bac-calculator/ | Bara promille-räknaren. Ingenting lämnar enheten — all data ligger i `localStorage` och `IndexedDB`. |
| **Suparkompisen (social)** | https://elarsson.github.io/bac-calculator/wsk/ | Som ovan, men med en **WSK**-flik som synkar med Supabase-backend när du sätter dig själv i läget Festar. |

## Hur den används

På den sociala varianten finns två toppflikar:

- **Solo** — din egen promille-logg. Status, kurva, historik, profil.
- **WSK** — gruppvyn. Allas kurvor på samma graf, ett flöde med drycker, snabbreaktioner (🍻 🔥 😂 💀 👏 🥂) och korta textsvar.

Under Solo-fliken finns en `Smygsuper | Festar`-väljare:

- **Smygsuper** är default. Inget lämnar enheten.
- **Festar** börjar dela din promillehalt. Endast drycker loggade *efter* att Festar slogs på (eller från första nyktra drycken i pågående pass, om du redan är på gång) synkas till servern.

När du växlar tillbaka till Smygsuper raderas all din data på servern direkt: kurvan, varje dryck-rad, varje uppladdat foto. Avatar och namn ligger kvar så att reaktioner du eventuellt postar senare attribueras rätt.

### Drycker

Sex kategorier: **Öl, Vin, Sprit, Grogg, Cider, Drink**. Varje kategori har egna styrka- och volympresets. Grogg och Drink frågar efter mängden sprit (inte hela drinkens volym), eftersom det är spriten som driver promillen.

Varje dryck kan ha:
- en **kommentar** (valfri text)
- en **bild** tagen direkt med bakkameran (lagras lokalt i IndexedDB, laddas upp till Supabase Storage bara om du är i Festar-läge)

### Identitet i WSK

Namn räcker — ingen autentisering. När du försöker använda ett namn som redan finns får du ett bekräftelseprompt: *"Erik finns redan — är detta du själv på en annan enhet?"*. Du kan välja Ja om du vill dela dina drycker mellan dina egna enheter. Designen accepterar att vänner i en mindre grupp inte försöker imitera varandra.

Selfies förvrängs på diagrammets legend och i flödet utifrån varje deltagares aktuella promille — en gång under 0,3 ‰ (rent), och progressivt mer kaos upp mot 2,5 ‰ (suddig, dubbelsyn, hue-shift).

## Kör lokalt

```bash
npm install --legacy-peer-deps
npm start
```

Öppna `http://localhost:4200/` för offline-varianten, eller starta dev-servern med social-konfigurationen:

```bash
npx ng serve --configuration=social
```

På telefonen från LAN:

```bash
npx ng serve --host 0.0.0.0
```

## Bygga för produktion

```bash
npm run build              # offline → dist/bac-calculator/browser/
npm run build:social       # social  → dist/suparkompisen-social/browser/
```

GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) bygger båda och lägger upp dem under olika sökvägar på GitHub Pages — offline på rot, social under `/wsk/`.

## Supabase

Den sociala buildens backend är Supabase (gratis-tier räcker långt för en kompiskrets). Sätt upp ett nytt projekt och kör [`docs/supabase-schema.sql`](docs/supabase-schema.sql) i SQL-editorn — den är idempotent och säker att köra om. Aktivera realtid på `participants`, `bac_curves`, `drinks` och `reactions` under Database → Replication, och skapa en publik storage-bucket som heter `photos`.

Fyll sedan i `url` och `anonKey` i [`src/environments/environment.social.ts`](src/environments/environment.social.ts). Lämnar du dem tomma faller social-buildet tillbaka till lokala data utan att krascha — alla nätverksanrop blir no-ops.

Den anonyma nyckeln är publik per design och RLS är öppen (alla autentiserade som anon kan läsa/skriva). Det funkar för en grupp vänner som delar samma URL — om du vill stänga gruppen senare lägger man till en grupp-kod-kontroll i policyerna.

## Privatlivskontrakt

Den hårda invarianten i [`WskSyncService`](src/app/services/wsk-sync.service.ts):

> Ingen dryck- eller kurv-skrivning når nätverket om inte `sharingMode === 'festar'` AND en `wskIdentity` finns AND Supabase är konfigurerat. Varje skrivväg kontrollerar invarianten i det ögonblick anropet sker, inte bara när effekten schemalades, så async-races vid toggle-off inte kan läcka.

På Festar → Smygsuper kör servern en bulk-delete (`wipeOwnContent`) som rensar alla drycker, alla foto-blobbar och kurv-raden för deltagaren. Avatar och deltagar-rad stannar kvar så reaktioner attribueras korrekt om användaren postar igen.

Offline-buildet får aldrig in Supabase-SDK:n alls — `angular.json` byter `supabase.service.ts` (stub) mot `supabase.service.real.ts` (riktig klient) först i `--configuration=social`. Stubbet returnerar `configured: false` och alla skrivmetoder är no-ops.

## Matematiken

Implementationen ligger i [`src/app/services/bac.service.ts`](src/app/services/bac.service.ts).

**Watsons formel för total kroppsvätska (liter):**
- Man: `TBW = 2.447 − 0.09516·ålder + 0.1074·längd_cm + 0.3362·vikt_kg`
- Kvinna: `TBW = −2.097 + 0.1069·längd_cm + 0.2466·vikt_kg`

**Widmark r:** `r = (TBW × 1.0517) / vikt_kg`

**Alkoholmassa per dryck (g):** `volym_ml × (alkoholhalt/100) × 0.789` (etanols densitet)

**Toppromille om allt absorberas direkt (‰):** `(gram / (r × vikt_kg × 10)) × 10`

Internt räknar appen i % och visar i promille (`× 10`) — i samma steg som dataformatet `0,015 %/tim → 0,15 ‰/tim` för eliminationen.

**Två-kompartmentmodell.** Varje dryck finns i två pooler — magen (oabsorberad) och blodet (absorberad men ännu inte metaboliserad).

*Magen → blodet* följer första ordningens kinetik med konstant *k* per timme, beroende på magläget när drycken loggades:

- Tom mage: 6,0/tim
- Lite mat: 2,0/tim
- Stor måltid: 1,0/tim

Instantana inflödet i blodet från dryck *i* är `k_i · topp_i · exp(−k_i · (t − t_i))` (i %BAC/tim).

*Blodet → eliminerat* följer nollte ordningens kinetik vid `β = 0,015 %BAC/tim` (= 0,15 ‰/tim). Blodpoolen kan aldrig gå under noll, så när BAC redan är 0 stiger systemet bara om inflödet överstiger elimineringskapaciteten.

Systemet integreras med explicit Euler i 30-sekunderssteg från första drycken. Nykter-tiden fås genom att detektera när blodet faktiskt återgår till noll efter att ha stigit.

Färgsteg i statuskortet följer svensk gränsdragning:
- **under körgränsen** under 0,2 ‰
- **rattfylleri** mellan 0,2 och 1,0 ‰
- **grovt rattfylleri** över 1,0 ‰

## Datalagring

Lokalt (alltid):
- `localStorage` — profil, drycker, magläge, delningsläge, identitet, enhets-ID, delningsstart
- `IndexedDB` (`suparkompisen` / `photos`) — dryckesfoton

Server (bara i Festar):
- Supabase Postgres — `participants`, `bac_curves`, `drinks`, `reactions`
- Supabase Storage (`photos`) — selfies (`avatars/<namn>.jpg`) och drinkfoton (`<drink-uuid>.jpg`)

Rensa lokal data via DevTools:

```js
localStorage.clear()
indexedDB.deleteDatabase('suparkompisen')
```

## Anmärkning

Riktig BAC varierar ±20–30 % från vilken formel som helst beroende på mat, genetik, mediciner, vätskebalans osv. Det här är en uppskattning, inte en mätning. Och självklart — kör aldrig efter att ha druckit. Promillegränserna i statuskortet är till för att förstå sin egen kväll, inte för att kalibrera vad som "räcker".
