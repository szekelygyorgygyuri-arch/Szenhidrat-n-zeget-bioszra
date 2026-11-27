# Változások (changelog)

## 1.8 – 2026-11-27

### Új
- **Analizáló nyílt láncú formában is:**
  - A beállításokban választható a forma: gyűrűs, nyílt lánc vagy vegyesen.
  - Nyílt láncban nincs gyűrű és anomer, ezért a gyűrűhöz kötött szerepeket (glikozidos OH, gyűrű-O, ficak, kamuficak) sem kell megadni. Az atomoknál az elemet és a sorszámot kell beírni, fent pedig a konfigurációt (D/L), a nevet és az összegképletet.
  - Diszacharidnál a redukáló vég egysége nyílik fel. A másik egység gyűrűs marad, ott a szerepeket is meg kell adni. A nem redukáló diszacharidok (pl. szacharóz) csak gyűrűs formában szerepelnek.
  - Az animáció a Kiértékelés után lejátszható, gyűrűs formában is.
- **Tanár mód** (kóddal kapcsolható be):
  - A Tippelőben és az Analizálóban narancssárga jelöli a jó válaszokat, mint a fejlesztői módban. Az Analizálóban egy gombbal kitölthető a megoldás.
  - Megjelenik a **Nyomda** fül a Nézegető és a Tippelő között. Fejlesztői módban is látszik.
- **Nyomda** – képek feladatlapokhoz:
  - Olyan, mint a nézegető, de a lejátszás helyett exportálni lehet.
    - A kép mindig vektoros (SVG).
    - Pontosan úgy készül, ahogy a középső részen látszik: számít a nagyítás, az elforgatás, a nézet (3D vagy 2D) és a forma (nyílt vagy gyűrűs).
  - A kép letölthető, vagy megnyitható új lapon. Ha a szövegszerkesztő nem fogadja az SVG-t, nagy felbontású PNG is kérhető.
  - Ugyanaz a molekulaválasztó és ugyanazok a csillagok, mint a nézegetőben.
  - A megjelenítési beállításai viszont külön vannak: amit az egyikben átkapcsolsz, az a másikban nem változik. Egy gombbal átvehetők a nézegető beállításai.
  - Saját beállítások:
    - színes vagy fekete-fehér;
    - teli vagy üreges atomok és kötések: üregesnél a belső rész a beállított szín, a körvonal ennek sötétebb változata, vagy bepipálva mindig fekete;
    - feliratok: nincs, C-atomok számozása, minden atom a H-k kivételével, minden atom, vagy csak a kattintással kiválasztott atomok;
    - a szerep is a feliratban (pl. O1 · glik. OH);
    - körbevágás a molekulára (az előnézeten szaggatott keret mutatja);
    - fehér vagy átlátszó háttér.
  - A tanár mód a Nyomda beállításai között kapcsolható ki.

## 1.7 – 2026-11-25

### Új
- **Analizáló** – harmadik fül a Nézegető és a Tippelő mellett:
  - Egy véletlenszerű, gyűrűs formájú mono- vagy diszacharidot kapsz, teljesen szürkén.
  - Minden atomot fel kell iratozni. Egy atomra kattintva kis menüben választod ki:
    - az elemét;
    - a sorszámát (az O és a H a szénatomjáét kapja);
    - diszacharidnál az egységét (′);
    - a szerepét: glikozidos OH, gyűrű-O, ficak, kamuficak vagy a glikozidos kötés O-ja.
  - A 3D-tér fölött meg kell adni a konfigurációt (D/L), a gyűrű tagszámát (5 vagy 6) és az anomert (α/β). Diszacharidnál ezt mindkét egységre, továbbá:
    - a glikozidos kötés típusát (ez kikapcsolható);
    - hogy redukáló-e.
  - A nevet és az összegképletet kereshető lenyíló listából kell kiválasztani.
  - A Kiértékelés megmutatja, melyik felirat és adat jó (zöld) és melyik nem (piros, mellette a helyes).
  - A bal oldali listában karikával jelölöd ki, miből válasszon. Elsőre a csillagozottak vannak bekarikázva, az X-ek nem.
  - Beállítható:
    - hogy a H-atomokat és a sima OH-csoportokat fel kell-e iratozni, meg vannak-e adva, vagy rejtve legyenek;
    - a nézet (3D, 2D vagy vegyesen).
  - Egyelőre csak a gyűrűs formájú mono- és diszacharidok szerepelnek, ezért itt nincs animáció.
- A nézegetőben minden molekulánál látszik, hogy redukáló-e, rövid magyarázattal.
- Fejlesztői módban az Analizálóban is narancssárga jelöli a jó válaszokat, és egy gombbal kitölthető a megoldás.

### Változott
- Debugger:
  - Csak a nézegetőben fut; más módból indítva oda vált, a végén pedig visszaáll.
  - A lista sorrendjében megy végig a molekulákon. Mindegyiket megjeleníti és lejátssza az animációt.
  - Utána a jobb oldali beállításokat fentről lefelé egyenként átállítja, majd visszaállítja. A végén minden színt narancsra cserél, majd vissza.
  - Két lépés között a megadott ideig vár.
  - Beállítható:
    - nézet: csak 3D, csak 2D vagy mindkettő;
    - visszaállítás: lépésenként, vagy egyszerre a molekula végén;
    - a hologram beállításain is végigmenjen-e.

### Javítva
- Ha 1 vagy 5 molekula volt kijelölve, „A 1 …” helyett most „Az 1 …” a felirat.
- A Tippelő kis menüjében a billentyűzetfókusz néha rossz helyre került.

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
