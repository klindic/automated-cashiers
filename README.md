# Checkout Lab

Interaktivna 3D simulacija tunelskih i klasičnih blagajni. Izgrađena u Babylon.js i TypeScriptu, s izvornim Blender modelom tunela.

## Objavljena simulacija

[Otvori Checkout Lab na GitHub Pages](https://klindic.github.io/automated-cashiers/).

Svaki push na `main` pokreće testove, produkcijski build i objavu kroz GitHub Actions. Postavke Pages koriste izvor **GitHub Actions**. Za lokalnu provjeru istog builda pokreni `npm run build:pages`, zatim `npm run preview -- --host 127.0.0.1` i otvori `/automated-cashiers/`.

## Pokretanje

Potreban je Node.js 22.12+ (provjereno na 22.17.1).

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Otvori adresu koju Vite ispiše, u pravilu http://127.0.0.1:5173/.

```sh
npm test -- --run
npm run build
npm run preview -- --host 127.0.0.1
```

## Korištenje

- Pokus se pokreće automatski. Pauziraj ga tipkom **Pauziraj**; brzinu mijenjaj od 1× do 20×.
- Povlačenjem okreći 3D kameru, kotačićem približi. **Pregled / Tunelske / Klasične** vraćaju spremljene kadrove. Klik na blagajnu otkriva njezino stanje i stanice. Escape zatvara detalj.
- Odaberi **Mirno / Normalno / Špica**, broj blagajni, stanica ili sjeme pa **Primijeni i pokreni novi pokus**. Sam odabir ne mijenja postojeći pokus.
- **Ponovi pokus** ponavlja trenutačno primijenjene postavke. Isti seed i postavke daju isti niz kupaca i rezultate.
- Po isteku trajanja zaustavljaju se dolasci i prikazuje se sačuvani sažetak. **Isprazni preostale redove** nastavlja obradu bez novih dolazaka.
- **Izvoz podataka** nudi zasebne CSV datoteke kupaca i vremenskih uzoraka. Svaki red uključuje konfiguraciju, seed, fazu izvoza i broj izlazaka na horizontu. Izvoz kupaca dostupan je nakon prvog dolaska.
- Skrivena kartica ne napreduje. Prebacivanje na drugu aplikaciju ne odrađuje cijeli pokus bez vidljivog prikaza.

## Kako je model postavljen

Izvorna specifikacija: `SPECIFIKACIJA_ROBLOX_SIMULACIJA.md`.
Web izvedba i interpretacije: `docs/SPECIFIKACIJA_WEB.md`.
Plan i status: `docs/superpowers/plans/2026-10-10-checkout-simulation.md`.
Blender izvori i regeneracija: `docs/BLENDER.md`.

Logika koristi simulacijski korak od 0,1 s i ne ovisi o broju iscrtanih kadrova. Oba sustava dobivaju isti unaprijed generiran niz dolazaka, broja artikala i načina plaćanja. Prvi kupac dolazi nakon prvog uzorkovanog razmaka. Traka ima konačan kapacitet (duljina 12, razmak 0,8 jedinica), zastaje pri plaćanju i pri blokadi kapaciteta. Stanica ostaje rezervirana do završetka pakiranja. Klasični model dopušta skeniranje sljedećeg kupca tijekom pakiranja prethodnog.

Ovo je operativni model zadanih pretpostavki, s procjenama vremena iz specifikacije; nije kalibriran stvarnim mjerenjima. Pretpostavlja savršeno skeniranje i izostanak grešaka. Hodanje je kozmetičko, bez dodatnog vremena usluge. Artikli nisu rigid-body fizika. Klasično skenirani artikli mogu privremeno čekati u apstraktnom međuspremniku. Zbog preglednosti prikaz stanica i redova može sažeti velik broj artikala ili kupaca; brojke se računaju iz punog modela.

Prosječno i najdulje ukupno trajanje uključuju samo završene kupce. Prosječno čekanje uključuje kupce koji su započeli utovar. Klizni protok koristi zadnjih 60 s, odnosno raspoloživi interval tijekom prve minute. Iskorištenost uključuje stanja Active i PaymentHold (i razdoblja pakiranja/odgode mirovanja), a nije mjera potrošnje energije ni isključivo rada motora trake. Blokada je zaseban udio u ukupnom vremenu svih blagajni.

## Struktura

- `src/simulation/`: čista simulacijska jezgra, konfiguracija, ugovori i testovi.
- `src/scene/`: Babylon scena, geometrija i vizualna interpolacija.
- `src/main.ts`: kontrole, pokretanje i povezivanje prikaza.
- `src/ui.ts`, `src/styles.css`: hrvatsko sučelje i izgled.
- `src/analytics.ts`: prikaz metrika, graf i CSV.
- `scripts/create_checkout_assets.py`: ponovljiva izrada Blender modela.
- `public/models/`: izvorni .blend i izvozni .glb.

## Sljedeće iteracije

Mjerena vremena za kalibraciju; detaljniji modeli kupaca i animacije ruku; eksplicitno modeliranje vremena hodanja; usporedba više ponovljenih seedova s intervalima nesigurnosti. Oni nisu preduvjet za korištenje ovog prototipa.

## Provjere prve verzije

29 automatiziranih testova pokriva logiku simulacije i sadržaj CSV izvoza. TypeScript i produkcijska izgradnja prolaze, a audit ovisnosti nema prijavljenih ranjivosti. Interaktivni prikaz, promjena konfiguracije, pauza, kamere, kraj pokusa i pražnjenje provjereni su u pregledniku. CSV sadržaj je provjeren testovima; preuzimanje je pokrenuto kroz sučelje, ali in-app preglednik nije vratio put spremljene datoteke. Vite upozorava na velik Babylon JavaScript bundle; optimizacija veličine ostaje za kasniju objavu.
