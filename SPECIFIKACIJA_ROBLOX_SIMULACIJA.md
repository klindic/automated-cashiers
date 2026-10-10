# Automatizirana blagajna s tunelskim skeniranjem: specifikacija za Roblox simulaciju

Verzija: 0.2 (nacrt, odluke iz v0.1 potvrđene)
Cilj dokumenta: opisati ideju i sve zahtjeve dovoljno precizno da se iz njega može izgraditi simulacija u Roblox Studiju (Luau).

Promjene u odnosu na v0.1:
- Usporedba s klasičnom blagajnom je sada **dio osnovnog opsega**, ne proširenje.
- Dodana analitika dolazaka i izlazaka kupaca po vremenu za oba sustava.
- Simulacija prikazuje **samo happy path**: nema grešaka skeniranja, grešaka kupaca ni nadzornika.
- Potvrđene odluke: kupac plaća kod trake i tu se sve zaustavlja, svaki kupac dobiva jednu stanicu (najnižu slobodnu), blagajne su uvijek dostupne (bude se kad netko dođe, uspavljuju kad su prazne), skeniranje je savršeno, kupci dolaze s košaricom nasumičnog broja artikala, bez polica.

---

## 1. Svrha simulacije

Simulacija služi za **vizualizaciju toka kupaca i izravnu usporedbu brzine** novog sustava (tunelske blagajne) i klasičnih blagajni s blagajnicom, pod identičnim prometom.

Pitanja na koja treba dati odgovor brojkama:

1. Koliko je kupaca u istom vremenu došlo, a koliko ih je izašlo u oba sustava?
2. Koliko je prosječno i maksimalno vrijeme provedeno u dućanu od dolaska u red do izlaska?
3. Je li 3 stanice po blagajni dovoljno ili se pojavljuje čekanje zbog zauzetosti?
4. Koliko blagajni novi sustav treba u mirnom razdoblju, a koliko u špici?
5. Koliko brzo prolazi kupac s malo artikala (cilj: oko 1 minute od dolaska do izlaska)?

Izvan opsega: stvarno prepoznavanje barkodova, hardver, računalni vid, fiskalizacija, cijene artikala, greške i nadzornik.

---

## 2. Koncept u jednoj rečenici

**Novi sustav:** kupac stavlja artikle na traku, traka ih vozi kroz tunel sa skenerima sa svih strana, artikli se automatski prepoznaju i usmjeravaju na jednu od 3 stanice za pakiranje, kupac plaća na kraju trake, zatim ide na svoju stanicu pakirati, dok se već skeniraju artikli sljedećeg kupca.

**Klasični sustav (referenca):** kupac stavlja artikle na traku, blagajnica ih jedan po jedan skenira, kupac plaća blagajnici, zatim pakira dok blagajnica skenira sljedećeg kupca.

---

## 3. Dva dućana u istoj sceni

Scena ima **dvije zone koje rade istovremeno i paralelno**:

- **Zona A: Tunelski dućan** (novi sustav).
- **Zona B: Klasični dućan** (referenca).

### 3.1 Pravila poštene usporedbe

- Obje zone dobivaju **isti niz kupaca**: za svakog kupca generira se jedan zapis (vrijeme dolaska, broj artikala, način plaćanja) i svaki se zapis pojavljuje **istovremeno u obje zone** kao dva zasebna NPC-a.
- Niz je određen **nasumičnim sjemenom** (`Seed`), tako da se pokus može točno ponoviti.
- Obje zone imaju isti broj blagajni (`NumLanes`), isti razmak između dolazaka i iste vremenske konstante za utovar, plaćanje i pakiranje. Razlikuje se samo način skeniranja i organizacija blagajne.
- Klasični dućan ima sve blagajne otvorene (svaka s jednom blagajnicom), što je **povoljna pretpostavka za klasični sustav** i čini usporedbu konzervativnom.

---

## 4. Elementi blagajne u Zoni A (tunelska blagajna)

Od ulaza prema izlazu:

1. **Zona za utovar** (početak trake). Kupac stavlja artikle jedan po jedan, bez preklapanja.
2. **Traka (conveyor).** Kreće se dok je blagajna aktivna, osim kad je zaustavljena na plaćanju.
3. **Razdjelnik / graničnik (divider).** Označava kraj artikala jednog kupca.
4. **Tunel / kupola sa skenerima.** Vizualno tunel nalik onom u zračnoj luci. U simulaciji: kratko svjetlo/animacija i brojač skeniranih artikala.
5. **Točka plaćanja** na kraju trake, s terminalom za karticu i mjestom za gotovinu.
6. **Skretnica (diverter)** koja usmjerava artikle na jednu od 3 stanice.
7. **3 stanice za pakiranje** (Stanica 1, 2, 3), svaka s vrećicama i prostorom za artikle jednog kupca.
8. **Indikator stanja blagajne:** zelena (aktivna), siva (mirovanje), narančasta (traka stoji na plaćanju), crvena (sve stanice zauzete).

### 4.1 Pravilo o graničniku

- Kupac postavlja graničnik iza svog zadnjeg artikla.
- Kad graničnik stigne do kraja trake, **traka staje** i kupac plaća. Nijedan sljedeći kupac ne napreduje dok se plaćanje ne završi.
- Nakon uspješnog plaćanja graničnik se **automatski vraća na početak** trake, traka se ponovno pokreće, a kupac odlazi na svoju stanicu.
- Radi jednostavnosti pretpostavlja se da blagajna ima dovoljno graničnika (vizualno 2), tako da sljedeći kupac može utovarivati i dok traka stoji.

---

## 5. Elementi blagajne u Zoni B (klasična blagajna)

1. **Traka za utovar** (jednaka veličina kao u Zoni A).
2. **Blagajnica** (NPC) koja ručno skenira artikle jedan po jedan.
3. **Terminal za plaćanje** kod blagajnice.
4. **Jedno područje za pakiranje** iza blagajnice (kapacitet: 1 kupac).
5. Indikator stanja: zelena (radi), siva (nema kupaca).

### 5.1 Tok klasične blagajne

1. Kupac utovari artikle na traku. Utovar sljedećeg kupca može teći dok blagajnica skenira prethodnog.
2. Blagajnica skenira artikle serijski: `ScanTimePerItem_Classic` po artiklu.
3. Blagajnica naplaćuje kupca (`PayTimeCard` ili `PayTimeCash`). Naplata može početi tek kad je područje za pakiranje slobodno.
4. Kupac pakira u području za pakiranje (isto vrijeme pakiranja kao u Zoni A), dok blagajnica već skenira sljedećeg kupca.
5. Kupac odlazi, područje za pakiranje se oslobađa.

Ovo je namjerno **povoljan model za klasični sustav** (pakiranje se preklapa sa skeniranjem sljedećeg kupca), tako da razlika koju simulacija pokaže ne dolazi od nepoštene postavke.

---

## 6. Tok jednog kupca (state machine, isti za obje zone)

| Stanje | Opis | Prijelaz |
|---|---|---|
| `Arriving` | Pojavi se na ulazu s košaricom i dolazi do prostora blagajni | Odabire blagajnu |
| `ChoosingLane` | Bira blagajnu (poglavlje 8) | Dolazi do trake |
| `WaitingForLoad` | Čeka u redu dok je zona utovara zauzeta | Zona slobodna, `Loading` |
| `Loading` | Stavlja artikle jedan po jedan na traku (u Zoni A i graničnik) | Završio, `WaitingForPayment` |
| `WaitingForPayment` | Stoji kod točke plaćanja dok artikli ne budu skenirani | Spremno za plaćanje, `Paying` |
| `Paying` | Plaća karticom (kratko) ili gotovinom (duže) | Gotovo, `Bagging` |
| `Bagging` | Pakira u vrećice, trajanje ovisi o broju artikala | Gotovo, `Leaving` |
| `Leaving` | Odlazi prema izlazu, stanica/područje se oslobađa | Despawn na izlazu |

Svaki kupac bilježi vremenske oznake: `tArrive`, `tStartLoad`, `tPayStart`, `tPayEnd`, `tLeave`. Iz njih se računaju sve metrike.

---

## 7. Logika blagajne Zone A (state machine)

| Stanje | Opis |
|---|---|
| `Idle` | Traka stoji, nema kupca, sve stanice prazne |
| `Active` | Traka vozi, artikli se skeniraju i usmjeravaju |
| `PaymentHold` | Traka stoji jer je graničnik stigao do kraja, čeka se plaćanje |
| `Blocked` | Sve 3 stanice zauzete, sljedeći artikli čekaju na traci |

### 7.1 Buđenje i uspavljivanje

- **Buđenje:** blagajna iz `Idle` prelazi u `Active` čim kupac stavi prvi artikl na traku.
- **Uspavljivanje:** blagajna prelazi u `Idle` kad su ispunjeni svi uvjeti: nema kupca u zoni utovara, na traci nema artikala, nema kupca na plaćanju, sve stanice su prazne, i prošlo je `LaneIdleDelay` sekundi.

### 7.2 Dodjela stanica

- Svaki kupac dobiva **jednu** od 3 stanica kad njegovi artikli krenu prema skretnici.
- Dodjela: **najniža slobodna stanica** (1, pa 2, pa 3).
- Stanica je zauzeta do trenutka kad kupac završi pakiranje i ode.
- Ako su sve 3 zauzete, blagajna je `Blocked`, a artikli sljedećeg kupca čekaju na traci dok se jedna ne oslobodi.

### 7.3 Primjer idealnog toka

1. Kupac A utovari artikle i graničnik, artikli prolaze tunel i padaju na Stanicu 1.
2. Graničnik stiže do kraja, traka staje, A plaća.
3. Plaćanje gotovo: graničnik se vraća, traka kreće, A ide pakirati na Stanicu 1.
4. U međuvremenu B utovari, artikli idu na Stanicu 2, B plaća, ide na Stanicu 2.
5. C isto, Stanica 3. Kad A završi, Stanica 1 se oslobađa za D.

---

## 8. Odabir blagajne

Isti algoritam u obje zone, s jednom razlikom u buđenju.

**Opterećenje blagajne** = broj kupaca koji čekaju na utovar + broj kupaca koji su trenutno u obradi na toj blagajni (Zona A: zauzete stanice i kupac na plaćanju; Zona B: kupac kod blagajnice i kupac na pakiranju).

**Zona A (tunelski dućan):**
- Kupac preferira već aktivne blagajne i bira onu s najmanjim opterećenjem.
- Probudi se uspavana blagajna samo ako je opterećenje svih aktivnih blagajni jednako ili veće od `WakeLoadThreshold` (zadano 2).
- Rezultat: u mirnom razdoblju radi samo nekoliko blagajni, a u špici sve, što je tražena dinamika.

**Zona B (klasični dućan):**
- Sve blagajne su otvorene (`ClassicOpenLanes = NumLanes`), kupac bira onu s najmanjim opterećenjem.

Tie-break u oba slučaja: najbliža blagajna. Parametar `ChoiceNoise` (0 do 1) daje malu vjerojatnost nasumičnog odabira radi realnosti.

---

## 9. Parametri (Configuration)

Sve vrijednosti u jednom `Config` modulu, mijenjaju se bez diranja logike.

| Parametar | Zadana vrijednost | Opis |
|---|---|---|
| `Seed` | 12345 | Sjeme za nasumični niz kupaca (isti niz u obje zone) |
| `RunDuration` | 600 s | Trajanje jednog pokusa u simuliranim sekundama |
| `NumLanes` | 4 | Broj blagajni u svakoj zoni (3 do 4) |
| `StationsPerLane` | 3 | Broj stanica za pakiranje po tunelskoj blagajni |
| `ClassicOpenLanes` | = `NumLanes` | Broj otvorenih klasičnih blagajni |
| `ArrivalIntervalMin` / `Max` | 6 / 20 s | Razmak između dolazaka kupaca |
| `ItemsPerCustomerMin` / `Max` | 2 / 30 | Nasumični broj artikala po kupcu |
| `LoadTimePerItem` | 1.0 s | Vrijeme da kupac stavi artikl na traku |
| `BeltSpeed` | 3 studs/s | Brzina trake |
| `ScanTimePerItem_Tunnel` | 0.3 s | Vrijeme artikla u tunelu (u simulaciji gotovo zanemarivo) |
| `ScanTimePerItem_Classic` | 2.0 s | Vrijeme ručnog skeniranja po artiklu |
| `PayTimeCard` | 4 s | Trajanje plaćanja karticom |
| `PayTimeCash` | 15 s | Trajanje plaćanja gotovinom |
| `CardPaymentChance` | 0.75 | Vjerojatnost plaćanja karticom |
| `BagTimeBase` | 3 s | Fiksno vrijeme pakiranja (uzimanje vrećice itd.) |
| `BagTimePerItem` | 1.5 s | Vrijeme pakiranja po artiklu |
| `LaneIdleDelay` | 5 s | Odgoda prije uspavljivanja prazne tunelske blagajne |
| `WakeLoadThreshold` | 2 | Opterećenje aktivnih blagajni pri kojem se budi nova |
| `ChoiceNoise` | 0.15 | Vjerojatnost nasumičnog odabira blagajne |
| `SimSpeed` | 1 | Množitelj brzine simulacije (1x do 20x) |

### 9.1 Prethodno postavljeni scenariji prometa

Gumbi koji mijenjaju `ArrivalInterval` i time opterećenje:

- **Mirno:** 15 do 40 s između kupaca.
- **Normalno:** 6 do 20 s.
- **Špica:** 2 do 8 s.

Tako se isti pokus lako ponovi za sva tri režima.

---

## 10. Scena i objekti u Roblox Studiju

### 10.1 Raspored prostora

- Dvije zone postavljene **jedna pored druge** (ili jedna iznad druge) tako da se obje vide odjednom.
- Svaka zona: ulaz, prostor s blagajnama, izlaz, jednostavno ograđen prostor.
- Navigacijski prostor (`PathfindingService`) mora pokrivati ulaz, prostor ispred traka, točke plaćanja, stanice/područja pakiranja i izlaz u obje zone.

### 10.2 Predložena hijerarhija

```
Workspace
  ZoneA_Tunnel (Model)
    Lanes (Folder)
      Lane1 (Model)
        Belt, LoadZone, Divider, Tunnel, PayPoint, StatusLight
        Stations (Folder): Station1, Station2, Station3
      Lane2 ...
    Spawn, Exit
  ZoneB_Classic (Model)
    Lanes (Folder)
      Lane1 (Model)
        Belt, LoadZone, Cashier (NPC), PayPoint, BaggingArea, StatusLight
      Lane2 ...
    Spawn, Exit
ServerScriptService
  Config (ModuleScript)
  CustomerSequence (ModuleScript)    -- generira niz kupaca iz Seeda
  TunnelLane (ModuleScript)
  ClassicLane (ModuleScript)
  CustomerController (ModuleScript)
  Spawner (Script)                   -- spawna isti zapis u obje zone
  Metrics (ModuleScript)
StarterGui
  HUD (ScreenGui)
```

### 10.3 Napomene za implementaciju

- **Traka:** `AssemblyLinearVelocity` na dijelu trake, ili stabilnije: artikli se pomiču skriptom (`TweenService`) po unaprijed zadanoj putanji umjesto fizikom.
- **Kupci i blagajnice:** NPC-ovi s `Humanoid`, kretanje preko `PathfindingService` i `Humanoid:MoveTo()`.
- **Artikli:** jednostavni dijelovi (kocke, valjci) u raznim bojama, generirani proceduralno.
- **Stanje:** svaka blagajna i kupac imaju atribut `State` (string) radi lakšeg praćenja u Exploreru.
- **Vrijeme:** koristiti `task.wait` i `os.clock`, sve vrijeme dijeliti sa `SimSpeed`.
- **Nasumičnost:** koristiti `Random.new(Seed)` za niz kupaca, tako da je niz identičan u obje zone i ponovljiv.

---

## 11. Analitika i HUD

HUD pokazuje **dva stupca, jedan po zoni**, plus stupac razlike.

### 11.1 Brojke uživo

| Metrika | Opis |
|---|---|
| Došlo | Ukupan broj kupaca koji su ušli u zonu |
| Izašlo | Ukupan broj kupaca koji su završili i otišli |
| U dućanu | Kupci trenutno u sustavu (došlo minus izašlo) |
| Izlazi u minuti | Klizni prosjek izlazaka u zadnjih 60 s |
| Prosječno vrijeme u sustavu | `tLeave - tArrive`, prosjek |
| Najdulje vrijeme u sustavu | Maksimum |
| Prosječno čekanje do utovara | `tStartLoad - tArrive` |
| Aktivne blagajne | Broj blagajni koje trenutno nisu `Idle` |
| Postotak vremena `Blocked` | Samo Zona A, pokazatelj jesu li 3 stanice premalo |
| Iskorištenost blagajni | Udio vremena u kojem je blagajna radila |

### 11.2 Zapis kroz vrijeme

- Svakih 10 simuliranih sekundi bilježi se uzorak: kumulativno došlo, izašlo i u dućanu za svaku zonu.
- Na kraju pokusa (`RunDuration`) prikazuje se **završni sažetak**: tablica obje zone i razlika (apsolutna i postotna), na primjer "Zona A opslužila 34 kupca, Zona B 21 kupca, razlika +62%".
- Isti sažetak i uzorci ispisuju se u **Output** u obliku koji se lako kopira (CSV redci), radi daljnje obrade u tablici.
- Opcionalno: jednostavan linijski graf "Izašlo kroz vrijeme" s dvije linije (Zona A i Zona B) u HUD-u.

### 11.3 Tumačenje

- Ako je razlika mala u režimu "Mirno", a velika u "Špica", to potvrđuje da se prednost vidi pri velikom prometu.
- Ako se u Zoni A često javlja `Blocked`, to je signal da 3 stanice po blagajni nisu dovoljne za dani promet.

---

## 12. Redoslijed izgradnje (milestones)

1. **Statični model jedne tunelske blagajne:** traka, graničnik, tunel, točka plaćanja, 3 stanice. Bez kupaca.
2. **Artikli na traci:** ručno okidanje, artikli putuju kroz tunel i padaju na stanicu.
3. **State machine tunelske blagajne:** `Idle`, `Active`, `PaymentHold`, `Blocked`, dodjela stanica.
4. **Jedan NPC kupac** kroz jednu tunelsku blagajnu, od spawna do izlaza.
5. **Klasična blagajna:** model s blagajnicom, serijsko skeniranje, područje za pakiranje, isti NPC kupac.
6. **`CustomerSequence` i `Spawner`:** isti niz kupaca u obje zone.
7. **Više blagajni i odabir blagajne** u obje zone.
8. **`Metrics` i HUD:** brojke uživo, uzorci kroz vrijeme, završni sažetak.
9. **Scenariji prometa** (Mirno, Normalno, Špica) i `SimSpeed`.
10. **Fino ugađanje** parametara i vizualnog dojma.

---

## 13. Faza 2 (izvan prvog izdanja)

Sve se odnosi samo na kasniju verziju, ne na happy path:

- Nadzornik koji hoda između blagajni.
- Pogreške skeniranja (`ScanFailChance`) i stanje `Fault` na blagajni.
- Pogreške kupaca (dva artikla jedan na drugom).
- Artikli s dobnom granicom (alkohol, cigarete) koji pauziraju blagajnu.
- Kupci koji napuštaju red zbog predugog čekanja.
- Promjena modela plaćanja (npr. plaćanje na stanici umjesto kod trake).

---

## 14. Pretpostavke (za pregled)

Odluke koje nisu bile u opisu, ispravi što ne odgovara:

- **Klasični model je povoljan za klasični sustav:** sve blagajne otvorene, pakiranje se preklapa sa skeniranjem sljedećeg kupca, utovar sljedećeg kupca preklapa se sa skeniranjem prethodnog.
- **`ScanTimePerItem_Classic = 2.0 s`** je procjena, ne mjerenje. Preporuka je izmjeriti stvarno vrijeme u dućanu i upisati u `Config`, jer o toj vrijednosti najviše ovisi veličina razlike.
- **Isti NPC zapis se kopira u obje zone**, pa su kupci u obje zone statistički identični.
- **Graničnika ima dovoljno** (vizualno 2 po blagajni), tako da utovar sljedećeg kupca ne čeka povratak graničnika.
- **Tunelska blagajna se budi samo kad su aktivne blagajne opterećene** (`WakeLoadThreshold`), što daje dinamiku "u mirnom dijelu radi nekoliko blagajni, u špici sve".
- **Cijene, računi i valute se ne simuliraju.**
