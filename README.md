# Szénhidrát 3D

Interaktív weboldal mono-, di- és poliszacharidok térbeli modelljeinek
megtekintéséhez.

## Mit tud?

- **33 monoszacharid** (triózok, tetrózok, pentózok, hexózok, heptózok;
  aldózok, ketózok, dezoxi- és aminocukrok, uronsavak), **24 diszacharid** és
  **27 poliszacharid**:
  - glükánok: amilóz, amilopektin, glikogén, cellulóz, dextrán, pullulán,
    kallóz, laminarin, zab-β-glükán;
  - fruktánok: inulin, levan;
  - egyéb homopoliszacharidok: kitin, kitozán, xilán, mannán, pektin,
    galaktomannán;
  - heteropoliszacharidok: glükomannán, alginát, agaróz, κ-karragén,
    hialuronsav, kondroitin-szulfát, dermatán-szulfát, heparin,
    keratán-szulfát, peptidoglikán.
- A poliszacharidoknak egy jellemző, 8–19 egységes részlete látszik, valódi
  térszerkezettel: az amilóz balmenetes spirál, a cellulóz és a kitin
  egyenes szalag, a xilán háromfogású csavar, az amilopektin és a glikogén
  elágazó. A „Lánc felépülése” animáció egységenként mutatja a kapcsolódást;
  ki van írva az ismétlődő egység és a kötések típusa.
- A bal oldali listában a monoszacharidok szénatomszám szerint növekvő
  sorrendben vannak. A diszacharidok az első egység szerint vannak
  csoportosítva, egyezés esetén a második szerint (pl. *glükóz + glükóz*,
  *glükóz + fruktóz*, *galaktóz + glükóz*).
- Minden molekulának két modellje van: **nyílt láncú** („csík”, cikcakk
  szénlánc) és **gyűrűs** forma. A kettő között a **gyűrűzáródás**
  animációja játszható le. A lánc elfordul, a gyűrű-O megtámadja a karbonil-C-t,
  végül a H átkerül, és kialakul a glikozidos OH.
- Diszacharidoknál a **redukáló vég** gyűrűje nyílhat fel. A **glikozidos
  kötés kialakulása** (két monoszacharid + vízkilépés) is lejátszható.
  A nem redukáló diszacharidoknál (szacharóz, trehalóz) nincs nyílt láncú
  forma.
- Választható szín és ki/be kapcsolható láthatóság:
  - **glikozidos OH** (az anomer C-atom OH-ja),
  - **gyűrű-O** (a glikozidos OH melletti oxigén),
  - **ficak** (a gyűrű-O túloldalán kiálló C-ág, pl. –CH₂OH),
  - **kamuficak** (ketózoknál az anomer C-atom –CH₂OH-ja),
  - **glikozidos kötés O-ja** (diszacharidoknál).
- H-atomok és a sima (nem kiemelt) OH-csoportok ki/be kapcsolása,
  C-atomok számozása, gyűrűsík, golyó–pálcika / pálcika / kalotta modell,
  atomszínek, D/L konfiguráció, piranóz/furanóz, α/β anomer.
- Gyűrűs formában kiírja, hogy a glikozidos OH és a ficak a gyűrű síkja
  felett vagy alatt áll (azonos vagy ellentétes oldalon).
- **Papír (2D) nézet:** a tankönyvi ábrák, ahogy kinyomtatva látszanak. A
  nyílt lánc **Fischer-projekcióban**, a gyűrűs forma **Haworth-képletben**
  látszik. Minden atom egy síkban van (mint egy papírlap), de a lap térben
  forgatható; ugyanazok a színek és beállítások érvényesek. Az animáció a tankönyvi átalakítást mutatja:
  1. a Fischer-projekció elforgatása,
  2. a lánc gyűrűvé hajlítása,
  3. elfordulás a gyűrű-O-t hordozó szénatom körül,
  4. a gyűrűzáródás.
- **Glikozidos kötés:** diszacharidoknál ki van írva a kötés típusa (α vagy β)
  és a kapcsolódó szénatomok (pl. α(1→4): az első egység C1 és a második
  egység C4′ atomja között); a 3D képen a híd-O mellett is látszik.
- **Csillagozás:** a lista elemei csillaggal megjelölhetők. A kereső
  melletti csillaggal a csillagozott molekulák a lista elejére kerülnek.
- **Tippelő (gyakorlás):** fent átkapcsolható. Véletlenszerűen ad egy
  molekulát a csillagozottak közül (ha nincs legalább kettő, az összesből), és
  ki kell választani, melyik az. Minden nézet és beállítás itt is használható;
  a pontszámot a böngésző megjegyzi.
- **Hologram:** a másik modell áttetsző rávetítése ugyanazokkal a színekkel.
  2D nézetben a valódi térbeli alakot, 3D nézetben a papírmodellt mutatja.
  A hologramon külön ki/be kapcsolható a C-váz, az OH-csoportok, a
  H-atomok, a ficak és a kamuficak, és állítható az átlátszósága.

## Megnyitás

Az oldal statikus fájlokból áll (`index.html`, `app.js`, `kinematics.js`,
`paper.js`, `data.js`). A Three.js-t a jsDelivr CDN-ről tölti be. Böngészőben egy helyi
szerverrel nyitható meg:

```sh
cd szenhidrat-n-zeget-bioszra
python3 -m http.server 8000
# majd: http://localhost:8000
```

Egyetlen, duplakattintással is megnyitható HTML-fájl így készíthető:

```sh
python3 tools/build_single.py szenhidrat-3d.html
```

Egy adott molekula közvetlenül is megnyitható a címben, pl. `#maltoz`,
`#fruktoz`, `#szacharoz`.

## Az adatok előállítása

A poliszacharidokat külön szkript készíti (a `data.js` „polys” részét frissíti):

```sh
python3 tools/generate_polys.py
```

Minden kötéstípushoz kiszámolja a diszacharid konformereit (célszerkezetnél a
φ/ψ glikozidos torziókat szisztematikusan is végigpásztázza), ezekből választja
ki azt, amelyik a természetes hélixet adja (egységenkénti elfordulás és
emelkedés), majd a láncot ezekkel a lépésekkel felépíti és MMFF94-gyel
kisimítja.

A `data.js`-t a `tools/generate_data.py` készíti RDKit-tel:

```sh
pip install rdkit numpy
python3 tools/generate_data.py
```

- A sztereokémia a Fischer-projekcióból (OH jobbra/balra) és az α/β anomer
  IUPAC-definíciójából adódik. A szkript ismert CIP-jelölésekkel ellenőrzi
  (pl. α-D-glükopiranóz: 1S,2R,3S,4S,5R; szacharóz).
- A 3D-szerkezet ETKDG beágyazással és MMFF94 erőtérrel készül. Az
  aldopiranózoknál a tankönyvi ⁴C₁ szék (L-sorban ¹C₄) az előnyben
  részesített konformáció.
- A nyílt láncú forma szénlánca cikcakk alakra van kényszerítve.
- A gyűrűzáródás animációja belső koordináták (kötéshossz, kötésszög,
  torziós szög) interpolációjával készül (`kinematics.js`), ezért a
  királis centrumok térállása az animáció alatt sem fordul át.
- A papírmodelleket (`paper.js`) a böngésző számolja a 3D szerkezetből: a
  Fischer-projekció jobb/bal és a Haworth-képlet fent/lent irányai a valódi
  térállásból adódnak. A hologramot merev illesztés (Horn-módszer) teszi
  pontosan a fő modellre.

## Licenc

© 2026 szekelygyorgygyuri-arch. Minden jog fenntartva (All rights reserved).
Részletek: [LICENSE](LICENSE). A külső összetevők (three.js, betűtípusok) a
saját licencük alá tartoznak.
