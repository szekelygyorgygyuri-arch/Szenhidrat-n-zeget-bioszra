# Változások (changelog)

## 1.6 – 2026-11-23

### Javítva
- A nagy poliszacharidoknál (pl. glikogén, amilopektin) lefagyhatott a böngésző.
  - A 2D rajz kiszámítása sokszor gyorsabb: a glikogéné kb. 3,5 s helyett 0,1 s.
  - A 2D rajz csak akkor készül el, amikor szükség van rá (2D nézet vagy hologram).
  - A 3D-tér néhány rajzolási hívással dolgozik (korábban atomonként és kötésenként külön), így az animáció is folyamatos.
- Alacsony ablakban (pl. 1280×720-as vagy digitális tábla, 200% fölötti nagyítás) a középső rész összement, és a molekula alig látszott.
  - Most a fejléc és az idővonal tömörebb, a leírás az „i” gombbal nyitható.
  - A molekula mindig kap helyet.
- Néhány poliszacharid 2D rajzán egy kötő O-atom egy szénatomra esett, ezért nem látszott. Érintett: zab-β-glükán, keratán-szulfát, pullulán, amilopektin, glikogén. Most szabad helyen van.

### Új
- A két oldalsó panel:
  - a felső sáv gombjaival elrejthető;
  - a széle húzásával átméretezhető (nagyon keskenyre húzva eltűnik, dupla kattintással visszaáll alapméretre);
  - elrejtve a középső rész gombjaival fiókként csúszik be, mint telefonon.
- Nagy nézet: a 3D-tér sarkában lévő gombbal a felső sáv és a panelek is eltűnnek. Mellette teljes képernyő gomb van.
- A molekulalistában a főcsoportok (mono-, di-, poliszacharidok) vastagabbak és színesek: világos témában lila, sötétben neonzöld.
- Tippelő:
  - A molekula mellett a D/L konfigurációt, a gyűrű tagszámát (5 vagy 6) és az anomert (α/β) is kérdezheti, ahol ez értelmezhető.
    - A válaszra kattintva egy kis menüben kell megadni őket.
    - A válasz csak akkor helyes, ha minden része jó. Ha csak a molekula jó, „Majdnem!” a visszajelzés.
  - A gyűrűzáródás animációja kikapcsolható. Ilyenkor csak a kész forma látszik, az animáció a válasz után nézhető meg.
  - Válasz előtt nem látszanak a forma beállításai és a gyűrű fölötti/alatti állást mutató címkék. A magyarázó szöveg sem árulja el az atomszámokat.
- Fejlesztői mód (kóddal kapcsolható be):
  - a Tippelőben jelöli a jó választ;
  - a Debugger végigkapcsolja a molekulák minden formáját és nézetét, közben magától is ellenőrzi a modelleket.

## 1.5 – 2026-11-23

### Javítva
- A Tippelő nem indult el, ha még nem volt csillagozott (X-szel kijelölt)
  molekula: csak egy figyelmeztetés jelent meg, kérdés nem. Most ilyenkor az
  összes molekulából kérdez, és kiírja, hogyan lehet X-szel szűkíteni.

### Új
- A Tippelő beállításaiban kikapcsolható az összegképlet a felajánlott
  molekulák neve alatt.
- Credits (készítők) szekció a leírásban.

## 1.4 – 2026-11-23

### Javítva
- A Láthatóság részben egy kapcsoló (H-atomok, sima OH-csoportok stb.)
  átállítása után az egész oldal feljebb ugrott, és újratöltés után is úgy
  maradt. Most az oldal a helyén marad.

### Új
- Nyitóablak rövid leírással. Bepipálható, hogy az adott eszközön többet ne
  jelenjen meg. A „Teljes leírás és changelog” gomb ide, a GitHub-oldalra visz.
- Felső sáv: **Redeem code** (kódbeváltás; a kód csak az angol ábécé
  nagybetűiből állhat) és **Report bugs** (hibabejelentés a GitHubon).
- Tippelő:
  - saját beállítások: a nézegető beállításait veszi át alapnak, de utána
    külön állíthatók;
  - a kérdések nézete (3D, 2D vagy vegyesen) rögzített, kérdés közben nem
    váltható;
  - a válaszlehetőségek alatt az összegképlet látszik;
  - állítható, hány válaszlehetőség legyen (legfeljebb ahány molekula a
    kérdések körében van);
  - állítható, hány lehetőség legyen egy sorban (alapból az ablak
    szélessége szerint); háromnál több sor helyett jobbra görgethető;
  - a bal oldali listában csillag helyett **X**-szel jelölöd ki, miből
    kérdezzen (elsőre a csillagozottak vannak kijelölve), és a nevek mellett
    nem látszik az összegképlet;
  - kérdezhet az összes molekulából is.
- Keskeny kijelzőn a középső rész görgethető, így a molekula mindig kap helyet.

## 1.3 – 2026-11-19
- 27 poliszacharid valódi térszerkezettel (glükánok, fruktánok, egyéb homo- és
  heteropoliszacharidok), a „Lánc felépülése” animációval és síkbeli
  Haworth-lánccal.
- Szulfátcsoportok, iduron-, mannuron-, guluronsav, 3,6-anhidrogalaktóz,
  muraminsav mint építőegység.

## 1.2 – 2026-11-19
- A 2D (papír) nézet valóban egy síkban van, mint a nyomtatott tankönyvi ábra.
- Diszacharidoknál kiírja a glikozidos kötés típusát (α/β) és a kapcsolódó
  szénatomokat.
- Csillagozás és Tippelő (gyakorló mód).
- Licenc: minden jog fenntartva.

## 1.1 – 2026-11-17
- Papír (2D) nézet: Fischer-projekció és Haworth-képlet, a tankönyvi
  átalakítás animációjával.
- Hologram: a másik nézet áttetsző rávetítése, saját kapcsolókkal.

## 1.0 – 2026-11-17
- Első kiadás: 33 monoszacharid és 24 diszacharid 3D modellje, nyílt lánc és
  gyűrűs forma, gyűrűzáródás és glikozidos kötés animációja, színezhető
  glikozidos OH, gyűrű-O, ficak és kamuficak.
