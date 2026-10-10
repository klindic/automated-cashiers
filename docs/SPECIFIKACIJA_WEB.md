# Web simulacija blagajni — izvedbena specifikacija

Izvor poslovnih pravila je `SPECIFIKACIJA_ROBLOX_SIMULACIJA.md`, verzija 0.2. Ovaj dokument mijenja platformu na Babylon.js i TypeScript. Rad je lokalni; objava nije dio prve iteracije.

## Arhitektura

Simulacija raspolaže vlastitim vremenom i unaprijed generiranim nizom kupaca. Babylon dobiva snimku stanja i prikazuje je u pravom 3D prostoru. Kamera, brzina monitora i usporen prikaz ne mijenjaju rezultate modela. Kontrole u pregledniku upravljaju simulacijom, a ne pojedinačnim animacijama.

`Simulation` iz `src/simulation/engine.ts`: konstruktor prima konfiguraciju, `advance(seconds)` pomiče vrijeme, `snapshot()` daje podatke, `drain()` nastavlja nakon kraja dolazaka. Reset stvara novu instancu. Završni horizont zaustavlja pokus na konfiguriranom trajanju; pražnjenje je zaseban korisnički korak.

`createCheckoutScene(canvas, config)` iz `src/scene/createScene.ts`: vraća `update(snapshot)`, `focus('all'|'tunnel'|'classic')`, `resize()` i `dispose()`. Scene ne posjeduju nikakvu logiku odlučivanja o radu blagajne.

## Interpretacije

- Obje zone imaju isti niz dolazaka, artikala, vrste plaćanja i nasumičnih izbora. Strategija buđenja tunelskih blagajni ostaje prema izvorniku; klasične biraju među svim blagajnama.
- Opterećenje broji jedinstvene kupce, tako da osoba čija je stanica rezervirana i koja je na plaćanju nije prebrojena dvaput.
- Početak mjerenja je dolazak u red; hodanje do reda nije zasebno stohastičko opterećenje. Hodanje je vizualno pojednostavljeno.
- Stanice su rezervirane od dolaska artikala do završetka pakiranja. Zadani broj je 3, uz mogućnost pokusa s 1–4 stanice.
- Artikli se premještaju kontrolirano, bez rigid-body sudara. Duljina trake je 12 simulacijskih jedinica, početna brzina 3 jedinice/s, razmak artikala/graničnika 0,8 jedinica. Utovar može napredovati samo kad je početak slobodan. Tunelski skener je na 60 % trake, a skretnica na kraju. Klasično skeniranje događa se na kraju trake. Skeniranje se preklapa s utovarom; graničnik putuje iza zadnjeg artikla i uvjetuje tunelsko plaćanje. Rezervirana stanica prima preostale artikle svog vlasnika i kad nema drugih slobodnih stanica.
- Nema stvarnog čitanja barkodova, pogrešaka, nadzornika, polica, fiskalizacije ili cijena.
- Prosječno ukupno vrijeme i maksimum računaju se samo za završene kupce; nezavršeni ostaju vidljivi kao kupci u sustavu. Nakon horizonta moguće je isprazniti redove bez novih dolazaka.
- Rezultati su rezultat zadanih pretpostavki, ne potvrđena prednost stvarnog hardvera. Vrijednosti trajanja preuzete su kao procjene iz izvornog dokumenta.

## Vizualni smjer

Svijetla podna scena s dva niza blagajni, neutralnim materijalima, tirkiznim tunelskim sustavom i narančastim klasičnim sustavom. Tamno sučelje služi za kontrole i analitiku. Zadana kamera prikazuje obje zone, može se okretati i približavati. Status trake, artikli i zauzetost stanica vidljivi su u prostoru.

Blender stvara ponovno upotrebljiv model tunela. Jednostavni likovi, artikli i podovi generiraju se kodom. Modeli i animacije u prvoj verziji stilizirani su; prikaz mora biti razumljiv i bez fotorealističnih detalja.

## Definicije analitike

Iskorištenost je udio zbrojenog vremena blagajni u stanjima Active i PaymentHold u broju blagajni × proteklo simulacijsko vrijeme. Blokiranost je odvojeni udio stanja Blocked s istim nazivnikom. U sučelju su vidljivi maksimum trajanja, klizni izlazi/minuti, aktivne blagajne i apsolutna/postotna razlika. Snimka horizonta ostaje sačuvana nakon pražnjenja.

## Preciznost modela i značenje mjerenja (implementirana jezgra)

- Prvi kupac dolazi nakon prvog generiranog razmaka; nema dodatnog kupca u trenutku 0. Dolazak točno na završnom horizontu uključen je u oba sustava.
- Događaji se obrađuju na mreži od 0,1 simulirane sekunde. Krajnji horizont može prekinuti posljednji korak; pražnjenje se zatim vraća na istu vremensku mrežu. Način dijeljenja `advance()` poziva i brzina prikaza ne mijenjaju rezultat.
- Artikli i graničnici na traci održavaju najmanje 0,8 simulacijskih jedinica razmaka. Tunelski skener je na 60% duljine, skretnica na kraju; klasični skener je na kraju. Kretanje je kontrolirani red objekata, bez simulacije dodira i sudara. Utovar koristi slobodno mjesto na ulazu, uključujući vrijeme plaćanja.
- Trajanje skeniranja zaustavlja pojedini artikl na skeneru, a artikli iza njega mogu popuniti razmak do dopuštenog minimuma. Tijekom plaćanja i blokade pune stanice cijela traka miruje; zaustavlja se i nedovršeni rad skenera. Već rezervirana stanica i dalje prihvaća artikle svojeg kupca čak i kad su sve stanice zauzete.
- Graničnik se stavlja čim iza posljednjeg artikla postoji slobodan razmak, bez dodatnog vremena ručnog utovara. Plaćanje tunelskog kupca počinje tek dolaskom graničnika na kraj.
- Klasični sustav ima apstraktno privremeno mjesto za skenirane artikle sljedećeg kupca dok prethodni pakira. Kad su svi njegovi artikli skenirani, naplata i daljnje skeniranje čekaju slobodno područje za pakiranje. To mjesto nije dodatna stanica za kupca.
- U snimci za 3D prikaz `items` sa `station: null` označavaju artikle na traci. Artikli s brojem stanice već su isporučeni i ostaju vidljivi ondje dok se ne spakiraju; ne smiju se ponovno voziti kroz skener. Položaj graničnika zasebno je `dividerProgress` kod kupca.
- Prosječno čekanje računa se samo za kupce koji su **započeli utovar**. Kupci koji još čekaju nisu uključeni u taj prosjek. Prosječno ukupno vrijeme i maksimum računaju se samo za kupce koji su izašli.
- Izlazi/min predstavljaju izlaze u prethodnih 60 sekundi. Tijekom prve minute stopa se preračunava na minutu iz dotad proteklog vremena; zato nije jednaka doslovnom broju izlazaka prije isteka 60 sekundi.
- Iskorištenost je udio stanja `Active` + `PaymentHold` u ukupnom vremenu svih konfiguriranih blagajni. Uključuje preostalo pakiranje i kratku odgodu uspavljivanja, pa nije mjerenje rada motora ili iskorištenosti blagajnice. `Blocked` se broji odvojeno s istim nazivnikom.
- Broj aktivnih klasičnih blagajni označava trenutačno stanje rada; sve konfigurirane klasične blagajne imaju osoblje i dostupne su od početka. Naknadno pražnjenje mijenja tekuće metrike, dok spremljena snimka horizonta ostaje nepromijenjena.
