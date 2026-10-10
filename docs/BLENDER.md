# Blender i prikaz u Babylon.js-u

Tunel je originalan proceduralno izrađen model ovog projekta, bez preuzetih modela ili vanjskih tekstura. `scripts/create_checkout_assets.py` generira geometriju i materijale u Blenderu. Prvi izvoz napravljen je stvarnim Blenderom 5.2.2 LTS.

## Ponovljiv izvoz

Iz korijena projekta na ovom Macu:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/create_checkout_assets.py
```

Na drugim računalima koristi lokalni `blender` izvršni program s istim argumentima. Skripta briše samo početnu scenu u novom procesu Blendera; zapisuje dva generirana artefakta:

- `public/models/checkout-tunnel.blend`: izvorni model s bevel modifikatorima i materijalima.
- `public/models/checkout-tunnel.glb`: gotov glTF model za web, s primijenjenim modifikatorima.

Dimenzije modela: širina **1,80**, dubina **1,67**, visina **2,145** jedinica. Jedinice zamišljamo kao metre za prikaz; simulacijske jedinice duljine odvojene su od geometrije. Ishodište je u sredini tunela na podu. Blender koristi Z kao visinu; glTF izvoz pretvara model u Y-up. Tunel je otvoren uzduž lokalne Z osi u Babylon sceni. Otvor prati traku na visini približno 0,9.

Model sadrži zaobljene aluminijske stranice i krov, tamne unutarnje panele, čelične noge i tirkizne svjetlosne vodilice. Izvorni `.blend` služi za daljnje ručno modeliranje; ponovno izvršavanje skripte prepisuje generirane modele.

## Integracija i daljnji rad

`src/scene/createScene.ts` učitava GLB pomoću Babylon `ImportMeshAsync` te klonira model za svaku tunelsku blagajnu. Dok se model učitava ili ako nije dostupan, jednostavniji geometrijski tunel održava scenu funkcionalnom. Model nema vlastitu poslovnu logiku ni fiziku.

Trake, skretnice, stanice, terminali, artikli i stilizirani likovi generiraju se Babylon kodom. Ovo je pravi 3D prikaz s orbit kamerom, svjetlima, sjenama i odabirom blagajne. Poze kupaca i blagajnica te kratki vizualni prijelaz artikala preko skretnice ovise o simulacijskom vremenu pa se zamrzavaju pri pauzi. Artikli na glavnoj traci koriste stvarni `progress` iz simulacije. Skretnica dodaje samo kratku vizualnu tranziciju nakon logičkog usmjeravanja; ne utječe na metrike.

Pri velikim redovima osobe se vizualno slažu u nekoliko stupaca, a na stanici se prikazuje najviše 18 artikala. To su ograničenja prikaza; stvarni broj kupaca i artikala ostaje u podacima i analitici. U prvoj iteraciji hodanje je kratka stilizirana tranzicija, bez navigacijskog sustava ili sudara.

Sljedeća iteracija modela može dodati detaljniji skener, pokretne skretnice, bolji model vrećica, kupce s rigom i GLB stanice, uz zadržavanje istog ugovora između simulacije i scene.
