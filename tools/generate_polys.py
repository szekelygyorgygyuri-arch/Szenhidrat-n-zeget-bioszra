#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Szénhidrát 3D – poliszacharidok
===============================

A poliszacharidok óriásmolekulák, ezért mindegyiknek egy jellemző, néhány
egységből álló részletét építjük fel, valódi térszerkezettel.

Módszer
-------
1. Minden kötéstípushoz (pl. α-D-Glc-(1→4)-α-D-Glc) a megfelelő diszacharid
   sok konformerét előállítjuk (ETKDG + MMFF94).
2. Minden konformerből kiszámoljuk azt a merev transzformációt, amely az
   egyik egységet a következőbe viszi. Egy homopolimerben ez a transzformáció
   ismétlődik, ezért a lánc csavarvonalat (hélixet) ír le; a hélix
   egységenkénti elfordulása és emelkedése adja a jellegzetes alakot
   (amilóz: balmenetes, ~6 egység/menet; cellulóz: kétfogású, egyenes szalag).
   Ahol ismert a természetes szerkezet, a célhoz legközelebbi alacsony
   energiájú konformert választjuk, máshol a legkisebb energiájút.
3. Az egységeket ezekkel a transzformációkkal egymáshoz illesztjük (az
   elágazásokat is), majd az egész részletet MMFF94-gyel kisimítjuk úgy, hogy
   a glikozidos torziós szögek a választott értéken maradjanak.

Használat: python3 generate_polys.py   (a ../data.js "polys" részét frissíti)
"""
import json
import math
import os
import re
import sys

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem import rdMolTransforms as MT

import generate_data as G

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data.js")

M = G.M
# Csak építőegységként használt monoszacharidok (a listában nem szerepelnek)
EXTRA = {
    "galNAc": M("galNAc", "N-acetilgalaktózamin", "", 6, "aldo", "RLLR", mods={2: "NHAc"}, rings=("p",), stem="galakto"),
    "manA": M("manA", "mannuronsav", "", 6, "aldo", "LLRR", mods={6: "COOH"}, rings=("p",), stem="manno"),
    "gulA": M("gulA", "guluronsav", "", 6, "aldo", "RRLR", mods={6: "COOH"}, rings=("p",), stem="gulo", cfg="L"),
    "idoA": M("idoA", "iduronsav", "", 6, "aldo", "LRLR", mods={6: "COOH"}, rings=("p",), stem="ido", cfg="L"),
    "idoA2S": M("idoA2S", "2-O-szulfo-iduronsav", "", 6, "aldo", "LRLR", mods={2: "OSO3H", 6: "COOH"}, rings=("p",), stem="ido", cfg="L"),
    "galNAc4S": M("galNAc4S", "N-acetilgalaktózamin-4-szulfát", "", 6, "aldo", "RLLR", mods={2: "NHAc", 4: "OSO3H"}, rings=("p",), stem="galakto"),
    "glcNAc6S": M("glcNAc6S", "N-acetilglükózamin-6-szulfát", "", 6, "aldo", "RLRR", mods={2: "NHAc", 6: "CH2OSO3H"}, rings=("p",), stem="glüko"),
    "glcNS6S": M("glcNS6S", "N-szulfoglükózamin-6-szulfát", "", 6, "aldo", "RLRR", mods={2: "NHSO3H", 6: "CH2OSO3H"}, rings=("p",), stem="glüko"),
    "gal4S": M("gal4S", "galaktóz-4-szulfát", "", 6, "aldo", "RLLR", mods={4: "OSO3H"}, rings=("p",), stem="galakto"),
    "anGal": M("anGal", "3,6-anhidrogalaktóz", "", 6, "aldo", "RLLR", mods={3: "Oanh", 6: "anh"}, rings=("p",), stem="galakto"),
    "murNAc": M("murNAc", "N-acetilmuraminsav", "", 6, "aldo", "RLRR", mods={2: "NHAc", 3: "Olactyl"}, rings=("p",), stem="glüko"),
}
SPEC = {**G.MONO_BY_ID, **EXTRA}

# Rövid nevek a residue-leíráshoz
GLC_A = ("glukoz", "D", "p", "a")
GLC_B = ("glukoz", "D", "p", "b")


def chain(seq, xs):
    """Lineáris lánc: seq a nem redukáló végtől a redukáló végig, xs[i] az
    i. és i+1. egység közötti kötés helye a szülő (i+1.) egységen."""
    if isinstance(xs, int):
        xs = [xs] * (len(seq) - 1)
    return list(seq), [(i, i + 1, xs[i]) for i in range(len(seq) - 1)]


def add_branch(res, links, seq, xs, parent, x):
    """Elágazás: seq lánc (nem redukáló végtől), amelynek utolsó egysége a
    parent egység x helyéhez kapcsolódik."""
    base = len(res)
    if isinstance(xs, int):
        xs = [xs] * (len(seq) - 1)
    res += list(seq)
    for i in range(len(seq) - 1):
        links.append((base + i, base + i + 1, xs[i]))
    links.append((base + len(seq) - 1, parent, x))
    return res, links


def P(id, name, alt, group, res_links, *, repeat, bondtext, desc, real=""):
    res, links = res_links
    return dict(id=id, name=name, alt=alt, group=group, res=res, links=links, repeat=repeat,
                bondtext=bondtext, desc=desc, real=real)


def _amylopectin():
    res, links = chain([GLC_A] * 9, 4)
    return add_branch(res, links, [GLC_A] * 5, 4, 4, 6)


def _glycogen():
    res, links = chain([GLC_A] * 8, 4)
    res, links = add_branch(res, links, [GLC_A] * 4, 4, 5, 6)   # 8..11 → 5
    res, links = add_branch(res, links, [GLC_A] * 4, 4, 2, 6)   # 12..15 → 2
    res, links = add_branch(res, links, [GLC_A] * 3, 4, 9, 6)   # 16..18 → 9
    return res, links


def _dextran():
    res, links = chain([GLC_A] * 8, 6)
    return add_branch(res, links, [GLC_A] * 2, 6, 3, 3)


def _laminarin():
    res, links = chain([GLC_B] * 8, 3)
    return add_branch(res, links, [GLC_B], 3, 3, 6)


def _inulin():
    fru = ("fruktoz", "D", "f", "b")
    res = [("glukoz", "D", "p", "a")] + [fru] * 8
    links = [(0, 1, 2)] + [(k + 1, k, 1) for k in range(1, 8)]
    return res, links


def _galactomannan():
    man = ("mannoz", "D", "p", "b")
    res, links = chain([man] * 8, 4)
    for p in (0, 2, 4, 6):
        res, links = add_branch(res, links, [("galaktoz", "D", "p", "a")], 4, p, 6)
    return res, links


def _alt(a, b, n, xa, xb):
    seq = [a if i % 2 == 0 else b for i in range(n)]
    xs = [xa if i % 2 == 0 else xb for i in range(n - 1)]
    return chain(seq, xs)


POLYS = [
    # ---------------- glükánok
    P("amiloz", "Amilóz", "a keményítő egyik része", "glukan", chain([GLC_A] * 12, 4),
      repeat="[→4)-α-D-glükóz-(1→]ₙ", bondtext="α(1→4) glikozidos kötések, elágazás nélkül",
      desc="A keményítő kb. 20–25%-a. Elágazás nélküli lánc, amely balmenetes csavarvonalba (hélixbe) "
           "tekeredik, menetenként kb. 6 glükózzal. A jód a spirál belsejébe épül be: ez okozza a "
           "jód–keményítő reakció kék színét.",
      real="több száz–több ezer glükózegység"),
    P("amilopektin", "Amilopektin", "a keményítő nagyobbik része", "glukan", _amylopectin(),
      repeat="[→4)-α-D-glükóz-(1→]ₙ + α(1→6) elágazások", bondtext="α(1→4) a láncokban, α(1→6) az elágazási pontokon",
      desc="A keményítő kb. 75–80%-a. Elágazó molekula: kb. 20–25 glükózegységenként α(1→6) kötéssel "
           "oldalág indul. A részletben egy elágazás látszik.",
      real="akár egymillió glükózegység"),
    P("glikogen", "Glikogén", "állati keményítő", "glukan", _glycogen(),
      repeat="[→4)-α-D-glükóz-(1→]ₙ + α(1→6) elágazások", bondtext="α(1→4) a láncokban, α(1→6) az elágazási pontokon",
      desc="Az állatok és a gombák tartalék-poliszacharidja (máj, izom). Az amilopektinnél sűrűbben "
           "ágazik el (8–12 egységenként), ezért gömb alakú, gyorsan bontható. A részletben több "
           "elágazás is látszik.",
      real="akár 30 000 glükózegység"),
    P("cellulosz", "Cellulóz", "rostanyag", "glukan", chain([GLC_B] * 8, 4),
      repeat="[→4)-β-D-glükóz-(1→]ₙ", bondtext="β(1→4) glikozidos kötések",
      desc="A növényi sejtfal fő anyaga, a Föld leggyakoribb szerves vegyülete. A β-kötés miatt minden "
           "második glükóz 180°-kal elfordul, így egyenes, szalagszerű lánc jön létre; a láncok "
           "hidrogénkötésekkel kötegekké (mikrofibrillumokká) állnak össze. Az ember nem tudja "
           "megemészteni.",
      real="több ezer–15 000 glükózegység"),
    P("dextran", "Dextrán", "", "glukan", _dextran(),
      repeat="[→6)-α-D-glükóz-(1→]ₙ + α(1→3) elágazások", bondtext="α(1→6) a főláncban, α(1→3) elágazások",
      desc="Baktériumok (pl. Leuconostoc) által szacharózból termelt glükán. Gyógyászatban "
           "vérplazmapótló, a laboratóriumban gélszűrő anyag (Sephadex)."),
    P("pullulan", "Pullulán", "", "glukan", chain([GLC_A] * 9, [4, 4, 6, 4, 4, 6, 4, 4]),
      repeat="[→6)-α-maltotrióz-(1→]ₙ", bondtext="α(1→4) a maltotrióz-egységeken belül, α(1→6) közöttük",
      desc="Az Aureobasidium pullulans gomba által termelt glükán: maltotrióz-egységek α(1→6) "
           "kötéssel. Ehető fóliák és kapszulák alapanyaga."),
    P("kalloz", "Kallóz", "β-1,3-glükán", "glukan", chain([GLC_B] * 10, 3),
      repeat="[→3)-β-D-glükóz-(1→]ₙ", bondtext="β(1→3) glikozidos kötések",
      desc="Növényi β(1→3)-glükán: sérüléskor és a háncsedények rostalemezein keletkezik, a "
           "pollentömlő falában is megtalálható. A lánc csavarvonalat formál."),
    P("laminarin", "Laminarin", "", "glukan", _laminarin(),
      repeat="[→3)-β-D-glükóz-(1→]ₙ + β(1→6) elágazások", bondtext="β(1→3) a főláncban, β(1→6) elágazások",
      desc="A barnamoszatok tartalék-poliszacharidja: β(1→3)-glükán kevés β(1→6) elágazással."),
    P("betaglukan", "Zab-β-glükán", "", "glukan", chain([GLC_B] * 9, [4, 4, 3, 4, 4, 3, 4, 4]),
      repeat="cellotriozil-egységek β(1→3) kötéssel", bondtext="β(1→4) és β(1→3) kötések vegyesen",
      desc="A zab és az árpa rostanyaga: β(1→4) kötésű cellotrióz/cellotetraóz szakaszok β(1→3) "
           "kötéssel összefűzve. Vízben oldódó élelmi rost, csökkenti a vér koleszterinszintjét."),
    # ---------------- fruktánok
    P("inulin", "Inulin", "", "fruktan", _inulin(),
      repeat="glükóz-α(1↔2)-[β-D-fruktóz-(2→1)]ₙ", bondtext="β(2→1) a fruktózok között, a láncvégen α(1↔2) glükóz",
      desc="Fruktózegységekből álló tartalék-poliszacharid (csicsóka, cikória, pitypang gyökere). A lánc "
           "egy szacharózegységgel kezdődik. Az ember nem emészti, prebiotikus rost."),
    P("levan", "Levan", "", "fruktan", chain([("fruktoz", "D", "f", "b")] * 8, 6),
      repeat="[→6)-β-D-fruktóz-(2→]ₙ", bondtext="β(2→6) glikozidos kötések",
      desc="Főleg baktériumok és egyes füvek által termelt fruktán, β(2→6) kötésekkel."),
    # ---------------- egyéb homopoliszacharidok
    P("kitin", "Kitin", "", "homo", chain([("nacetilglukozamin", "D", "p", "b")] * 8, 4),
      repeat="[→4)-β-D-N-acetilglükózamin-(1→]ₙ", bondtext="β(1→4) glikozidos kötések",
      desc="Az ízeltlábúak külső vázának és a gombák sejtfalának anyaga. Szerkezete a cellulózéhoz "
           "hasonló, de a C2-n OH helyett acetamidocsoport (–NH–CO–CH₃) van."),
    P("kitozan", "Kitozán", "", "homo", chain([("glukozamin", "D", "p", "b")] * 8, 4),
      repeat="[→4)-β-D-glükózamin-(1→]ₙ", bondtext="β(1→4) glikozidos kötések",
      desc="A kitin deacetilezett származéka (a C2-n szabad aminocsoport). Sebkötözőkben, "
           "élelmiszer- és víztisztításban használják."),
    P("xilan", "Xilán", "hemicellulóz", "homo", chain([("xiloz", "D", "p", "b")] * 9, 4),
      repeat="[→4)-β-D-xilóz-(1→]ₙ", bondtext="β(1→4) glikozidos kötések",
      desc="A hemicellulóz fő komponense (fa, szalma, kukoricacsutka). Pentózokból álló lánc, "
           "háromfogású csavarvonal; ficakja nincs, mert a xilopiranóz C5-je a gyűrűben van."),
    P("mannan", "Mannán", "", "homo", chain([("mannoz", "D", "p", "b")] * 8, 4),
      repeat="[→4)-β-D-mannóz-(1→]ₙ", bondtext="β(1→4) glikozidos kötések",
      desc="Mannózegységekből álló poliszacharid (pl. elefántcsontpálma magja, élesztők sejtfala)."),
    P("pektin", "Pektin", "poligalakturonsav", "homo", chain([("galakturonsav", "D", "p", "a")] * 9, 4),
      repeat="[→4)-α-D-galakturonsav-(1→]ₙ", bondtext="α(1→4) glikozidos kötések",
      desc="A növényi sejtfal és a középlemez anyaga (alma, citrusfélék héja). Galakturonsav-lánc, "
           "amelynek karboxilcsoportjai részben metilészterek; savas közegben, cukorral gélt képez "
           "(lekvár, zselé). A részletben a nem észteresített forma látszik."),
    P("galaktomannan", "Galaktomannán", "guargumi", "homo", _galactomannan(),
      repeat="β(1→4)-mannán-lánc α(1→6) galaktóz-oldalcsoportokkal", bondtext="β(1→4) a mannánláncban, α(1→6) galaktózágak",
      desc="Mannóz-gerinc, amelyhez minden második egységen α(1→6) kötéssel egy galaktóz kapcsolódik "
           "(guarmag, szentjánoskenyér). Élelmiszer-sűrítőanyag (E412, E410)."),
    # ---------------- heteropoliszacharidok
    P("glukomannan", "Glükomannán", "konjak", "hetero",
      chain([("mannoz", "D", "p", "b")] * 2 + [GLC_B] + [("mannoz", "D", "p", "b")] * 3 + [GLC_B, ("mannoz", "D", "p", "b")], 4),
      repeat="mannóz és glükóz β(1→4) kötéssel (kb. 1,6 : 1)", bondtext="β(1→4) glikozidos kötések",
      desc="A konjak gumójának rostanyaga: mannóz- és glükózegységek β(1→4) kötéssel, véletlenszerű "
           "sorrendben. Erősen duzzad, telítettségérzetet kelt."),
    P("alginat", "Alginát", "", "hetero",
      chain([("manA", "D", "p", "b")] * 4 + [("gulA", "L", "p", "a")] * 4, 4),
      repeat="β-D-mannuronsav és α-L-guluronsav (1→4) blokkokban", bondtext="β(1→4) a mannuronsav-, α(1→4) a guluronsav-blokkban",
      desc="A barnamoszatok sejtfalának anyaga. Mannuronsav (M) és guluronsav (G) blokkokból áll; "
           "kalciumionokkal gélt képez (E401, fogászati lenyomatanyag). A részletben egy M- és egy G-blokk látszik."),
    P("agaroz", "Agaróz", "az agar fő része", "hetero",
      _alt(("galaktoz", "D", "p", "b"), ("anGal", "L", "p", "a"), 8, 4, 3),
      repeat="[→3)-β-D-galaktóz-(1→4)-3,6-anhidro-α-L-galaktóz-(1→]ₙ", bondtext="felváltva β(1→4) és α(1→3) kötések",
      desc="A vörösmoszatokból nyert agar fő része. Ismétlődő egysége a β-D-galaktóz és a "
           "3,6-anhidro-L-galaktóz (agarobióz). Táptalajok és gélelektroforézis alapanyaga."),
    P("karragen", "κ-Karragén", "", "hetero",
      _alt(("gal4S", "D", "p", "b"), ("anGal", "D", "p", "a"), 8, 4, 3),
      repeat="[→3)-β-D-galaktóz-4-szulfát-(1→4)-3,6-anhidro-α-D-galaktóz-(1→]ₙ", bondtext="felváltva β(1→4) és α(1→3) kötések",
      desc="Vörösmoszatokból nyert, szulfátcsoportokat tartalmazó galaktán. Élelmiszer-sűrítő és "
           "-zselésítő anyag (E407)."),
    P("hialuronsav", "Hialuronsav", "", "hetero",
      _alt(("glukuronsav", "D", "p", "b"), ("nacetilglukozamin", "D", "p", "b"), 8, 3, 4),
      repeat="[→4)-β-D-glükuronsav-(1→3)-β-D-N-acetilglükózamin-(1→]ₙ", bondtext="felváltva β(1→3) és β(1→4) kötések",
      desc="Glikózaminoglikán: a kötőszövet, az ízületi folyadék és az üvegtest fontos alkotója. "
           "Rengeteg vizet köt meg, ezért kozmetikumokban is használják."),
    P("kondroitinszulfat", "Kondroitin-szulfát", "", "hetero",
      _alt(("glukuronsav", "D", "p", "b"), ("galNAc4S", "D", "p", "b"), 8, 3, 4),
      repeat="[→4)-β-D-glükuronsav-(1→3)-β-D-N-acetilgalaktózamin-4-szulfát-(1→]ₙ", bondtext="felváltva β(1→3) és β(1→4) kötések",
      desc="Glikózaminoglikán, a porc fő alkotója; a szulfátcsoportok negatív töltése vizet köt, ez "
           "adja a porc rugalmasságát."),
    P("dermatanszulfat", "Dermatán-szulfát", "", "hetero",
      _alt(("idoA", "L", "p", "a"), ("galNAc4S", "D", "p", "b"), 8, 3, 4),
      repeat="[→4)-α-L-iduronsav-(1→3)-β-D-N-acetilgalaktózamin-4-szulfát-(1→]ₙ", bondtext="felváltva α(1→3) és β(1→4) kötések",
      desc="Glikózaminoglikán (bőr, erek, szívbillentyűk). A kondroitin-szulfáttól az L-iduronsav "
           "különbözteti meg."),
    P("heparin", "Heparin", "", "hetero",
      _alt(("idoA2S", "L", "p", "a"), ("glcNS6S", "D", "p", "a"), 8, 4, 4),
      repeat="[→4)-α-L-iduronsav-2-szulfát-(1→4)-α-D-N-szulfoglükózamin-6-szulfát-(1→]ₙ", bondtext="α(1→4) glikozidos kötések",
      desc="Erősen szulfatált glikózaminoglikán, a legnagyobb negatív töltéssűrűségű ismert "
           "biomolekula. Véralvadásgátló gyógyszer."),
    P("keratanszulfat", "Keratán-szulfát", "", "hetero",
      _alt(("galaktoz", "D", "p", "b"), ("glcNAc6S", "D", "p", "b"), 8, 4, 3),
      repeat="[→3)-β-D-galaktóz-(1→4)-β-D-N-acetilglükózamin-6-szulfát-(1→]ₙ", bondtext="felváltva β(1→4) és β(1→3) kötések",
      desc="Glikózaminoglikán, uronsav helyett galaktózt tartalmaz (szaruhártya, porc)."),
    P("peptidoglikan", "Peptidoglikán", "murein – glikánlánc", "hetero",
      _alt(("nacetilglukozamin", "D", "p", "b"), ("murNAc", "D", "p", "b"), 8, 4, 4),
      repeat="[→4)-β-D-N-acetilglükózamin-(1→4)-β-D-N-acetilmuraminsav-(1→]ₙ", bondtext="β(1→4) glikozidos kötések",
      desc="A baktériumok sejtfalának anyaga. A glikánláncokat a muraminsav laktilcsoportjához "
           "kapcsolódó rövid peptidek kötik hálóvá (ezek a részletben nem szerepelnek). A lizozim "
           "és a penicillin ennek a szerkezetnek a felépülését, ill. épségét támadja."),
]
for p in POLYS:
    p.setdefault("real", "")

# A természetes szerkezet: egységenkénti forgás (n, előjeles: + jobbmenetes)
# és emelkedés (Å). signed=False esetén a menetirányt nem vesszük figyelembe.
TARGETS = {
    (("glukoz", "a"), "glukoz", 4): (-6.0, 1.35, True),      # V-amilóz
    (("glukoz", "b"), "glukoz", 4): (2.0, 5.15, False),      # cellulóz
    (("nacetilglukozamin", "b"), "nacetilglukozamin", 4): (2.0, 5.15, False),
    (("glukozamin", "b"), "glukozamin", 4): (2.0, 5.15, False),
    (("mannoz", "b"), "mannoz", 4): (2.0, 5.15, False),
    (("xiloz", "b"), "xiloz", 4): (-3.0, 4.95, True),
    (("galakturonsav", "a"), "galakturonsav", 4): (3.0, 4.35, True),
    (("glukoz", "b"), "glukoz", 3): (6.0, 2.94, False),
    (("manA", "b"), "manA", 4): (2.0, 5.17, False),
    (("gulA", "a"), "gulA", 4): (2.0, 4.35, False),
}

GREEK = {"a": "α", "b": "β"}


# ---------------------------------------------------------------------------
#  Segédek
# ---------------------------------------------------------------------------
def kabsch_mat(Pm, Qm):
    """4×4 merev transzformáció, amely Pm-et Qm-re illeszti."""
    R, t = G.kabsch(Pm, Qm)
    T = np.eye(4)
    T[:3, :3] = R
    T[:3, 3] = t
    return T


def apply(T, P):
    return P @ T[:3, :3].T + T[:3, 3]


def screw(T):
    """Hélixparaméterek: (n egység/menet előjellel, emelkedés Å)."""
    R, t = T[:3, :3], T[:3, 3]
    c = max(-1.0, min(1.0, (np.trace(R) - 1) / 2))
    th = math.acos(c)
    if th < 1e-3:
        return float("inf"), float(np.linalg.norm(t))
    if abs(math.pi - th) < 1e-3:
        w, v = np.linalg.eigh(R + R.T)
        u = v[:, np.argmax(w)]
    else:
        u = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(th))
    h = float(t @ u)
    n = 360.0 / math.degrees(th)
    return (n if h >= 0 else -n), abs(h)


TEMPL = {}


def template(rt):
    """Egy építőegység (key, cfg, gyűrű, anomer) szabad gyűrűs konformere."""
    if rt not in TEMPL:
        key, cfg, ring, an = rt
        r = G.mono_ring(SPEC[key], cfg, ring, an, nconf=60)
        TEMPL[rt] = r
    return TEMPL[rt]


DIMER = {}
SCANDATA = {}


def transform_of(D, X):
    TA = kabsch_mat(D["tA"]["P"][D["mA"]["ring"]], X[D["ringA"]])
    TB = kabsch_mat(D["tB"]["P"][D["mB"]["ring"]], X[D["ringB"]])
    iTB = np.linalg.inv(TB)
    ov = {}
    for i, a in enumerate(D["uB"].atoms):
        if a["c"] == D["x"] and ("B", i) in D["idx"]:
            ov[i] = apply(iTB, X[D["idx"][("B", i)]][None, :])[0]
    return iTB @ TA, ov


def scan(key, step=15):
    """A φ/ψ glikozidos torziók szisztematikus pásztázása (MMFF, rögzített torziókkal)."""
    D = SCANDATA[key]
    mol = D["mol"]
    mp = AllChem.MMFFGetMoleculeProperties(mol)
    base = Chem.Conformer(mol.GetConformer(D["cid"]))
    out = []
    for phi in range(-180, 180, step):
        for psi in range(-180, 180, step):
            m2 = Chem.Mol(mol)
            m2.RemoveAllConformers()
            cid = m2.AddConformer(Chem.Conformer(base), assignId=True)
            conf = m2.GetConformer(cid)
            MT.SetDihedralDeg(conf, *D["phi"], float(phi))
            MT.SetDihedralDeg(conf, *D["psi"], float(psi))
            ff = AllChem.MMFFGetMoleculeForceField(m2, mp, confId=cid)
            ff.MMFFAddTorsionConstraint(*D["phi"], False, phi - 3.0, phi + 3.0, 300.0)
            ff.MMFFAddTorsionConstraint(*D["psi"], False, psi - 3.0, psi + 3.0, 300.0)
            ff.Minimize(maxIts=600)
            e = AllChem.MMFFGetMoleculeForceField(m2, mp, confId=cid).CalcEnergy()
            if not G.stereo_ok(m2, cid, D["ref"]):
                continue
            out.append((e, transform_of(D, G.coords(m2, cid))))
    out.sort(key=lambda z: z[0])
    return out


def dimer(child, parent, x, nconf=160):
    """child(1→x)parent diszacharid konformerei: [(E, T_child→parent, ...)]."""
    key = (child, parent, x)
    if key in DIMER:
        return DIMER[key]
    sA, sB = SPEC[child[0]], SPEC[parent[0]]
    uA, uB = G.Unit(sA, child[1]), G.Unit(sB, parent[1], "′")
    mA, mB = uA.ring_meta(child[2]), uB.ring_meta(parent[2])
    bA, bB = uA.ring_bonds(child[2]), uB.ring_bonds(parent[2])
    oB = uB.X[x]
    nonred = x == uB.co
    hB = mB["tH"] if nonred else uB.HX[x]
    gA, gB = {mA["aO"], mA["tH"]}, {hB}
    idx, order = {}, []
    for i in range(len(uA.atoms)):
        if i not in gA:
            idx[("A", i)] = len(order); order.append(("A", i))
    for i in range(len(uB.atoms)):
        if i not in gB:
            idx[("B", i)] = len(order); order.append(("B", i))
    units = {"A": uA, "B": uB}

    def remap(bonds, u, ex):
        return [(idx[(u, i)], idx[(u, j)], o) for i, j, o in bonds if i not in ex and j not in ex]
    bonds = remap(bA, "A", gA) + remap(bB, "B", gB) + [(idx[("A", mA["aC"])], idx[("B", oB)], 1)]
    els = [units[u].atoms[i]["el"] for u, i in order]
    mol = G.make_mol(els, bonds)

    def rs(specs, u):
        return [(idx[(u, c)], {idx[(u, j)]: p for j, p in nb.items()}) for c, nb in specs]
    cA, nbA = uA.anomer_spec(child[2], child[3], exo=-1)
    nbA2 = {(idx[("B", oB)] if j == -1 else idx[("A", j)]): p for j, p in nbA.items()}
    specs = rs(uA.fischer_specs(), "A") + [(idx[("A", cA)], nbA2)] + rs(uB.fischer_specs(), "B") \
        + rs([uB.anomer_spec(parent[2], parent[3])], "B")
    G.apply_stereo(mol, specs)
    ref = G.legacy_cip(mol)
    confs = G.embed(mol, nconf, 2024)
    tA, tB = template(child), template(parent)
    ringA = [idx[("A", i)] for i in mA["ring"]]
    ringB = [idx[("B", i)] for i in mB["ring"]]
    out = []
    for cid, e in confs:
        if not G.stereo_ok(mol, cid, ref):
            continue
        X = G.coords(mol, cid)
        TA = kabsch_mat(tA["P"][mA["ring"]], X[ringA])
        TB = kabsch_mat(tB["P"][mB["ring"]], X[ringB])
        T = np.linalg.inv(TB) @ TA  # a gyerek helye a szülő keretében
        # a szülő kapcsolódó csoportja (C_x és szubsztituensei) a dimer szerint
        iTB = np.linalg.inv(TB)
        ov = {}
        for i, a in enumerate(uB.atoms):
            if a["c"] == x and ("B", i) in idx:
                ov[i] = apply(iTB, X[idx[("B", i)]][None, :])[0]
        out.append((e, (T, ov)))
    out.sort(key=lambda z: z[0])
    # a torziós pásztázáshoz megőrzött adatok
    cx = idx[("B", uB.C[x])]
    nbr = [n.GetIdx() for n in mol.GetAtomWithIdx(cx).GetNeighbors()
           if n.GetSymbol() == "C"]
    best_cid = min(((e, cid) for cid, e in confs if G.stereo_ok(mol, cid, ref)))[1]
    SCANDATA[key] = dict(mol=mol, cid=best_cid, ref=ref, tA=tA, tB=tB, ringA=ringA, ringB=ringB,
                         mA=mA, mB=mB, uB=uB, idx=idx, x=x,
                         phi=(idx[("A", mA["rO"])], idx[("A", mA["aC"])], idx[("B", oB)], cx),
                         psi=(idx[("A", mA["aC"])], idx[("B", oB)], cx, min(nbr)))
    DIMER[key] = out
    print(f"    dimer {child[0]}{GREEK[child[3]]}(1→{x}){parent[0]}: {len(out)} konformer")
    return out


def choose(child, parent, x):
    """A kötéstípushoz választott transzformáció(k): célérték szerint, vagy a
    legkisebb energiájú néhány (ütközésvizsgálathoz)."""
    cands = dimer(child, parent, x)
    emin = cands[0][0]
    tgt = TARGETS.get(((child[0], child[3]), parent[0], x))
    if tgt and child[0] == parent[0]:
        nt, ht, signed = tgt
        cands = sorted(cands + scan((child, parent, x)), key=lambda z: z[0])
        emin = cands[0][0]
        best = None
        for e, (T, ov) in cands:
            if e > emin + 10.0:
                break
            n, h = screw(T)
            dn = abs(n - nt) if signed else abs(abs(n) - abs(nt))
            score = dn / abs(nt) + abs(h - ht) / ht + 0.03 * (e - emin)
            if best is None or score < best[0]:
                best = (score, (T, ov), n, h, e - emin)
        print(f"      cél n={nt:+.1f} h={ht:.2f} → n={best[2]:+.2f} h={best[3]:.2f} (ΔE={best[4]:.1f})")
        return [best[1]]
    low = [TO for e, TO in cands if e <= emin + 5.0][:8]
    return low or [cands[0][1]]


# ---------------------------------------------------------------------------
#  Polimer felépítése
# ---------------------------------------------------------------------------
def build_poly(ps):
    res, links = ps["res"], ps["links"]
    n = len(res)
    parent_of = {c: (p, x) for c, p, x in links}
    kids = {i: [] for i in range(n)}
    for c, p, x in links:
        kids[p].append((c, x))
    roots = [i for i in range(n) if i not in parent_of]
    assert len(roots) == 1, roots
    root = roots[0]
    units = [G.Unit(SPEC[k], cfg) for (k, cfg, ring, an) in res]
    metas = [u.ring_meta(r[2]) for u, r in zip(units, res)]
    tmpls = [template(r) for r in res]
    # kötéstípusok és jelöltek
    ltype = {}
    for c, p, x in links:
        ltype[(c, p)] = (res[c], res[p], x)
    choices = {}
    for key in set(ltype.values()):
        choices[key] = choose(*key)
    pick = {k: 0 for k in choices}

    def place(pick):
        Ps = {root: np.eye(4)}
        q = [root]
        while q:
            p = q.pop(0)
            for c, x in kids[p]:
                Ps[c] = Ps[p] @ choices[ltype[(c, p)]][pick[ltype[(c, p)]]][0]
                q.append(c)
        return Ps

    # atomok: az egységek atomjai, a kilépő víz atomjai nélkül
    removed = [set() for _ in range(n)]
    for c, p, x in links:
        removed[c] |= {metas[c]["aO"], metas[c]["tH"]}
        up = units[p]
        if x == up.co:
            removed[p].add(metas[p]["tH"])
        else:
            removed[p].add(up.HX[x])
    index = {}
    atoms = []
    for r in range(n):
        for i, a in enumerate(units[r].atoms):
            if i in removed[r]:
                continue
            index[(r, i)] = len(atoms)
            atoms.append((r, i))
    N = len(atoms)

    def coords_for(Ps, pick):
        loc = [tmpls[r]["P"].copy() for r in range(n)]
        for c, p, x in links:
            for i, v in choices[ltype[(c, p)]][pick[ltype[(c, p)]]][1].items():
                loc[p][i] = v
        X = np.zeros((N, 3))
        for k, (r, i) in enumerate(atoms):
            X[k] = apply(Ps[r], loc[r][i:i + 1])[0]
        return X

    bonds = []
    for r in range(n):
        for i, j, o in units[r].ring_bonds(res[r][2]):
            if (r, i) in index and (r, j) in index:
                bonds.append((index[(r, i)], index[(r, j)], o))
    link_bonds = []
    for c, p, x in links:
        b = (index[(c, metas[c]["aC"])], index[(p, units[p].X[x])], 1)
        bonds.append(b)
        link_bonds.append((c, p, x, b))
    bonded = {(min(i, j), max(i, j)) for i, j, _ in bonds}
    els = [units[r].atoms[i]["el"] for r, i in atoms]
    heavy = [k for k in range(N) if els[k] != "H"]
    resi = np.array([r for r, i in atoms])

    def clash(X):
        H = X[heavy]
        d = np.linalg.norm(H[:, None, :] - H[None, :, :], axis=2)
        s = 0.0
        for a in range(len(heavy)):
            for b in range(a + 1, len(heavy)):
                if d[a, b] < 2.6 and resi[heavy[a]] != resi[heavy[b]] and (heavy[a], heavy[b]) not in bonded:
                    s += (2.6 - d[a, b]) ** 2
        return s

    # ütközésminimalizálás a cél nélküli kötéstípusokra (mohó)
    for key in sorted(choices, key=lambda k: -len(choices[k])):
        if len(choices[key]) <= 1:
            continue
        best = None
        for k in range(len(choices[key])):
            pick[key] = k
            s = clash(coords_for(place(pick), pick))
            if best is None or s < best[0]:
                best = (s, k)
        pick[key] = best[1]
    Ps = place(pick)
    X = coords_for(Ps, pick)
    blen = [np.linalg.norm(X[i] - X[j]) for c, p, x, (i, j, o) in link_bonds]
    print(f"      glikozidos kötéshosszak: {min(blen):.2f}–{max(blen):.2f} Å")
    print(f"    {ps['name']}: {n} egység, {N} atom, ütközés {clash(X):.2f}")

    # RDKit molekula és MMFF-simítás a glikozidos torziók rögzítésével
    mol = G.make_mol(els, bonds)
    conf = Chem.Conformer(N)
    for k in range(N):
        conf.SetAtomPosition(k, X[k].tolist())
    mol.AddConformer(conf, assignId=True)
    Chem.AssignStereochemistryFrom3D(mol)
    ref = G.legacy_cip(mol)
    nb = {k: [] for k in range(N)}
    for i, j, _ in bonds:
        nb[i].append(j); nb[j].append(i)
    tors = []
    for c, p, x, (ca, ox, _o) in link_bonds:
        ro = index[(c, metas[c]["rO"])]
        cx = index[(p, units[p].C[x])]
        nxt = [a for a in nb[cx] if a != ox and els[a] == "C"]
        tors.append((ro, ca, ox, cx))
        if nxt:
            tors.append((ca, ox, cx, nxt[0]))
    # gyűrűn kívüli kapcsolódás (pl. 1→6): az ω torziót is rögzítjük
    for c, p, x, (ca, ox, _o) in link_bonds:
        cx = index[(p, units[p].C[x])]
        if units[p].C[x] in metas[p]["ring"]:
            continue
        nxt = [a for a in nb[cx] if a != ox and els[a] == "C"]
        if nxt:
            n2 = [a for a in nb[nxt[0]] if a != cx and els[a] in "CO"]
            if n2:
                tors.append((ox, cx, nxt[0], n2[0]))
    mp = AllChem.MMFFGetMoleculeProperties(mol)
    ff = AllChem.MMFFGetMoleculeForceField(mol, mp, confId=0)
    for (a, b, c, d) in tors:
        v = MT.GetDihedralDeg(mol.GetConformer(0), a, b, c, d)
        ff.MMFFAddTorsionConstraint(a, b, c, d, False, v - 12, v + 12, 50.0)
    ff.Minimize(maxIts=4000)
    X = G.coords(mol, 0)
    m2 = Chem.Mol(mol)
    Chem.AssignStereochemistryFrom3D(m2)
    assert G.legacy_cip(m2) == ref, f"{ps['name']}: sztereokémia megváltozott"

    # megjelenítési keret: a lánc vízszintes, a redukáló vég jobbra
    Hc = X[heavy]
    c0 = Hc.mean(0)
    _, _, vt = np.linalg.svd(Hc - c0)
    e1, e2 = vt[0], vt[1]
    rc = X[[k for k in range(N) if resi[k] == root]].mean(0)
    if (rc - c0) @ e1 < 0:
        e1 = -e1
    e3 = np.cross(e1, e2)
    R = np.vstack([e1, e2, e3])
    X = (X - c0) @ R.T

    # csoportok
    g = dict(glyc=[], ringO=[], ficak=[], kamu=[], bridge=[])
    root_used = any(x == units[root].co for c, x in kids[root])
    if not root_used:
        g["glyc"] = [index[(root, metas[root]["aO"])], index[(root, metas[root]["tH"])]]
    for r in range(n):
        u, mt = units[r], metas[r]
        g["ringO"].append(index[(r, mt["rO"])])
        for i, a in enumerate(u.atoms):
            if (r, i) not in index:
                continue
            if a["c"] > mt["k"]:
                g["ficak"].append(index[(r, i)])
            if u.co == 2 and a["c"] == 1:
                g["kamu"].append(index[(r, i)])
    bridges = []
    for c, p, x, (ca, ox, _o) in link_bonds:
        g["bridge"].append(ox)
        an = res[c][3]
        cpos = units[c].co
        arrow = "↔" if x == units[p].co else "→"
        lk = f"{GREEK[an]}({cpos}{arrow}{x})"
        if arrow == "↔":
            lk += GREEK[res[p][3]]
        bridges.append(dict(o=ox, child=c, parent=p, aC=ca, cx=index[(p, units[p].C[x])], link=lk))
    ingroup = set(sum(g.values(), []))
    ohs = []
    for k in range(N):
        if els[k] == "O" and k not in ingroup:
            hs = [j for j in nb[k] if els[j] == "H"]
            if hs and hs[0] not in ingroup:
                ohs.append([k, hs[0]])
    residues = []
    for r in range(n):
        residues.append(dict(
            ring=[index[(r, i)] for i in metas[r]["ring"]],
            aC=index[(r, metas[r]["aC"])],
            parent=parent_of.get(r, (-1, 0))[0],
            key=res[r][0], an=res[r][3], ketose=units[r].co == 2))
    # növekedési sorrend: a redukáló végtől kifelé
    order, q = [], [root]
    while q:
        p = q.pop(0)
        order.append(p)
        q += [c for c, x in kids[p]]
    # ismétlődő egység képlete: (monomer − H₂O)
    # ismétlődő egység képlete: (monomer − H₂O); azonos összegképletű egységek
    # (pl. glükóz és mannóz) egy egységnek számítanak
    reps = {}
    for r in res:
        u = G.Unit(SPEC[r[0]], r[1])
        e = [a["el"] for a in u.atoms]
        e.remove("O"); e.remove("H"); e.remove("H")
        reps.setdefault(G.formula(e)[0], e)
    els_rep = sum(reps.values(), [])
    fml, mass = G.formula(els_rep)
    labs = []
    for r, i in atoms:
        labs.append(units[r].atoms[i]["lab"])
    return dict(
        id=ps["id"], name=ps["name"], alt=ps["alt"], group=ps["group"], desc=ps["desc"],
        repeat=ps["repeat"], bondtext=ps["bondtext"], real=ps["real"],
        formula=f"({fml})ₙ", mass=mass, nres=n,
        el=els, lab=labs, bb=[1 if units[r].atoms[i]["role"] == "C" else 0 for r, i in atoms],
        resi=[int(v) for v in resi], x=G.flat(X), b=[list(b) for b in bonds], g=g, ohs=ohs,
        residues=residues, bridges=bridges, order=order, root=root,
        links=sorted(set(b["link"] for b in bridges), key=lambda s: (s[2:], s)),
    )


def main(only=None):
    print("Poliszacharidok:")
    out = []
    for ps in POLYS:
        if only and ps["id"] not in only:
            continue
        out.append(build_poly(ps))
    return out


def write(polys):
    with open(OUT, encoding="utf-8") as f:
        js = f.read()
    m = re.match(r"(?s)(.*?window\.SUGAR_DATA = )(.*);\s*$", js)
    data = json.loads(m.group(2))
    data["polys"] = polys
    js = m.group(1) + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Kiírva: {os.path.normpath(OUT)} ({len(js) / 1024:.0f} KB)")


if __name__ == "__main__":
    only = sys.argv[1:] or None
    polys = main(only)
    if not only:
        write(polys)
