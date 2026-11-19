#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Szénhidrát 3D – adatgenerátor
=============================

Monoszacharidok és diszacharidok nyílt láncú és gyűrűs formáinak 3D
koordinátáit állítja elő, és a ``../data.js`` fájlba írja.

* A sztereokémia a Fischer-projekcióból (OH jobbra / balra) és az anomer
  (α/β) IUPAC-definíciójából adódik; ebből RDKit királis jelöléseket
  készítünk, majd ETKDG-vel beágyazzuk és MMFF94 erőtérrel optimalizáljuk.
* A nyílt láncú formánál a szénláncot cikcakk ("csík") alakra kényszerítjük.
* Minden atom sorrendje a nyílt és a gyűrűs formában azonos, így a böngésző
  belső koordinátákban (kötéshossz, kötésszög, torziós szög) interpolálva
  tudja lejátszani a gyűrűzáródást.
* Diszacharidoknál a glikozidos kötés kialakulásához (kondenzáció) is
  előállítjuk a két különálló monoszacharid helyzetét és a kilépő vizet.

Használat::

    pip install rdkit numpy
    python3 generate_data.py
"""
import json
import math
import os
import sys

import numpy as np
from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem
from rdkit.Chem import rdMolTransforms as MT
from rdkit.Chem import rdCIPLabeler

RDLogger.DisableLog("rdApp.*")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data.js")

R, L = "R", "L"

# ---------------------------------------------------------------------------
#  Monoszacharidok (D-sor Fischer-mintázata; az L-forma a tükörképe)
# ---------------------------------------------------------------------------
#  sides: aldózoknál a C2..C(n-1), ketózoknál a C3..C(n-1) heteroatomjának
#         oldala a Fischer-projekcióban ('R' jobbra, 'L' balra, '-' dezoxi)
#  mods:  {szénatom: 'H' (dezoxi) | 'NH2' | 'NHAc' | 'CH3' | 'COOH'}


def M(id, name, alt, n, kind, sides, *, rings=("p", "f"), stem=None, prefix="",
      suffix="óz", mods=None, cfg="D", sub=None, defv=None, desc=""):
    return dict(id=id, name=name, alt=alt, n=n, kind=kind, sides=sides,
                rings=list(rings), stem=stem, prefix=prefix, suffix=suffix,
                mods=mods or {}, cfg=cfg, sub=sub or kind, defv=defv, desc=desc)


MONOS = [
    # ---- Triózok
    M("glicerinaldehid", "Glicerinaldehid", "", 3, "aldo", "R", rings=(),
      desc="A legegyszerűbb aldóz (aldotrióz), a D/L-jelölés viszonyítási alapja. "
           "Foszfátja a glikolízis köztiterméke. Gyűrűt nem képez."),
    M("dihidroxiaceton", "Dihidroxiaceton", "", 3, "keto", "", rings=(), cfg=None,
      desc="A legegyszerűbb ketóz (ketotrióz). Nincs királis szénatomja, ezért nincs "
           "D- és L-formája. Foszfátja a glikolízis köztiterméke. Gyűrűt nem képez."),
    # ---- Tetrózok
    M("eritroz", "Eritróz", "", 4, "aldo", "RR", rings=("f",), stem="eritro",
      desc="Aldotetróz. Eritróz-4-foszfát formájában a pentóz-foszfát-út és az aromás "
           "aminosavak bioszintézisének köztiterméke. Csak öttagú (furanóz) gyűrűt képezhet."),
    M("treoz", "Treóz", "", 4, "aldo", "LR", rings=("f",), stem="treo",
      desc="Aldotetróz, az eritróz C2-epimerje. Csak öttagú (furanóz) gyűrűt képezhet."),
    M("eritruloz", "Eritrulóz", "", 4, "keto", "R", rings=(),
      desc="Ketotetróz. Gyűrűt nem képez, mert a C4-OH túl közel van a karbonilcsoporthoz. "
           "Önbarnító krémek összetevője."),
    # ---- Pentózok
    M("riboz", "Ribóz", "", 5, "aldo", "RRR", rings=("f", "p"), stem="ribo", defv="f-b",
      desc="Aldopentóz. Az RNS, az ATP, a NAD és a FAD cukorkomponense, ezekben "
           "β-D-ribofuranóz formában van jelen."),
    M("arabinoz", "Arabinóz", "", 5, "aldo", "LRR", stem="arabino", cfg="L",
      desc="Aldopentóz. A természetben főleg L-formában fordul elő: a pektin, a "
           "hemicellulóz és a gumiarábikum alkotója."),
    M("xiloz", "Xilóz", "facukor", 5, "aldo", "RLR", stem="xilo",
      desc="Facukor. Aldopentóz, a hemicellulóz (xilán) építőegysége. Redukálásával "
           "xilit (édesítőszer) készül."),
    M("lixoz", "Lixóz", "", 5, "aldo", "LLR", stem="lixo",
      desc="Aldopentóz, a xilóz C2-epimerje. A természetben ritka."),
    M("ribuloz", "Ribulóz", "", 5, "keto", "RR", rings=("f",), stem="ribulo",
      desc="Ketopentóz. Ribulóz-1,5-biszfoszfát formájában ez köti meg a CO₂-t a "
           "fotoszintézis Calvin-ciklusában (RuBisCO enzim)."),
    M("xiluloz", "Xilulóz", "", 5, "keto", "LR", rings=("f",), stem="xilulo",
      desc="Ketopentóz, a pentóz-foszfát-út köztiterméke (xilulóz-5-foszfát)."),
    M("dezoxiriboz", "2-Dezoxiribóz", "", 5, "aldo", "-RR", mods={2: "H"},
      rings=("f", "p"), stem="ribo", prefix="2-dezoxi-", sub="dezoxi", defv="f-b",
      desc="A DNS cukorkomponense. A ribóztól a 2. szénatomon hiányzó OH-csoport "
           "különbözteti meg."),
    # ---- Hexózok – aldózok
    M("alloz", "Allóz", "", 6, "aldo", "RRRR", stem="allo",
      desc="Aldohexóz, a glükóz C3-epimerje. A természetben ritka."),
    M("altroz", "Altróz", "", 6, "aldo", "LRRR", stem="altro",
      desc="Aldohexóz, a mannóz C3-epimerje. A természetben ritka."),
    M("glukoz", "Glükóz", "szőlőcukor", 6, "aldo", "RLRR", stem="glüko",
      desc="Szőlőcukor. A sejtek legfontosabb energiaforrása; a keményítő, a glikogén és "
           "a cellulóz építőegysége. Vizes oldatban kb. 64% β- és 36% α-D-glükopiranóz."),
    M("mannoz", "Mannóz", "", 6, "aldo", "LLRR", stem="manno",
      desc="Aldohexóz, a glükóz C2-epimerje. A glikoproteinek szénhidrát-láncainak "
           "fontos alkotója."),
    M("guloz", "Gulóz", "", 6, "aldo", "RRLR", stem="gulo",
      desc="Aldohexóz. A természetben ritka."),
    M("idoz", "Idóz", "", 6, "aldo", "LRLR", stem="ido",
      desc="Aldohexóz. L-iduronsav formájában a heparin és a dermatán-szulfát alkotója."),
    M("galaktoz", "Galaktóz", "", 6, "aldo", "RLLR", stem="galakto",
      desc="Aldohexóz, a glükóz C4-epimerje. A tejcukor (laktóz) alkotórésze."),
    M("taloz", "Talóz", "", 6, "aldo", "LLLR", stem="talo",
      desc="Aldohexóz, a galaktóz C2-epimerje. A természetben ritka."),
    # ---- Hexózok – ketózok
    M("pszikoz", "Pszikóz", "allulóz", 6, "keto", "RRR", stem="psziko", defv="f-b",
      desc="Ketohexóz, a fruktóz C3-epimerje. Alacsony energiatartalmú édesítőszer."),
    M("fruktoz", "Fruktóz", "gyümölcscukor", 6, "keto", "LRR", stem="frukto", defv="f-b",
      desc="Gyümölcscukor, a legédesebb természetes cukor. A szacharózban "
           "β-D-fruktofuranóz formában van jelen; szabadon, oldatban főleg β-piranóz."),
    M("szorboz", "Szorbóz", "", 6, "keto", "RLR", stem="szorbo", cfg="L",
      desc="Ketohexóz. L-szorbóz formájában a C-vitamin ipari előállításának köztiterméke."),
    M("tagatoz", "Tagatóz", "", 6, "keto", "LLR", stem="tagato",
      desc="Ketohexóz, a fruktóz C4-epimerje. Alacsony energiatartalmú édesítőszer."),
    # ---- Hexózok – dezoxi-, amino-cukrok, uronsavak
    M("fukoz", "Fukóz", "", 6, "aldo", "RLLR", mods={6: "CH3"}, rings=("p",), stem="fuko",
      cfg="L", sub="dezoxi",
      desc="6-dezoxi-L-galaktóz. Glikoproteinekben és az AB0 vércsoport-antigénekben "
           "fordul elő. Ficakja metilcsoport (–CH₃)."),
    M("ramnoz", "Ramnóz", "", 6, "aldo", "LLRR", mods={6: "CH3"}, rings=("p",), stem="ramno",
      cfg="L", sub="dezoxi",
      desc="6-dezoxi-L-mannóz. Növényi glikozidok (pl. rutin) és bakteriális sejtfalak "
           "alkotója. Ficakja metilcsoport (–CH₃)."),
    M("glukozamin", "Glükózamin", "", 6, "aldo", "RLRR", mods={2: "NH2"}, rings=("p",),
      stem="glüko", prefix="2-amino-2-dezoxi-", sub="amino",
      desc="2-amino-2-dezoxi-D-glükóz. Aminocukor; a kitin és a porcszövet "
           "glikózaminoglikánjainak alapja."),
    M("galaktozamin", "Galaktózamin", "", 6, "aldo", "RLLR", mods={2: "NH2"}, rings=("p",),
      stem="galakto", prefix="2-amino-2-dezoxi-", sub="amino",
      desc="2-amino-2-dezoxi-D-galaktóz. A porc kondroitin-szulfátjának és sok "
           "glikoproteinnek az alkotója."),
    M("nacetilglukozamin", "N-acetilglükózamin", "GlcNAc", 6, "aldo", "RLRR",
      mods={2: "NHAc"}, rings=("p",), stem="glüko", prefix="2-acetamido-2-dezoxi-",
      sub="amino", defv="p-b",
      desc="A glükózamin N-acetil-származéka. A kitin (rovar- és rákpáncél, gombák "
           "sejtfala) és a bakteriális sejtfal építőegysége."),
    M("glukuronsav", "Glükuronsav", "", 6, "aldo", "RLRR", mods={6: "COOH"}, rings=("p",),
      stem="glüko", suffix="uronsav", sub="uron", defv="p-b",
      desc="A glükóz uronsava (a C6 karboxilcsoporttá oxidált). A máj ezzel teszi "
           "kiválaszthatóvá a méreganyagokat; a hialuronsav alkotója. Ficakja –COOH."),
    M("galakturonsav", "Galakturonsav", "", 6, "aldo", "RLLR", mods={6: "COOH"},
      rings=("p",), stem="galakto", suffix="uronsav", sub="uron",
      desc="A galaktóz uronsava, a pektin fő építőegysége. Ficakja –COOH."),
    # ---- Heptózok
    M("szedoheptuloz", "Szedoheptulóz", "", 7, "keto", "LRRR", stem="szedoheptulo",
      desc="Ketoheptóz. Foszfátjai a pentóz-foszfát-út és a Calvin-ciklus köztitermékei."),
    M("mannoheptuloz", "Mannoheptulóz", "", 7, "keto", "LLRR", stem="mannoheptulo",
      desc="Ketoheptóz, az avokádóban fordul elő; gátolja a glükóz foszforilálását "
           "(hexokináz)."),
]
MONO_BY_ID = {m["id"]: m for m in MONOS}

# ---------------------------------------------------------------------------
#  Diszacharidok
# ---------------------------------------------------------------------------
#  A: (mono, D/L, gyűrű, anomer) – a nem redukáló (első) egység
#  B: (mono, D/L, gyűrű)          – a második egység
#  x: B melyik szénatomjának O-jához kapcsolódik A anomer C-atomja
#  banom: nem redukáló diszacharidnál B rögzített anomerje


def D(id, name, alt, A, B, x, *, banom=None, defv="b", desc=""):
    return dict(id=id, name=name, alt=alt, A=A, B=B, x=x, banom=banom, defv=defv, desc=desc)


DIS = [
    D("xilobioz", "Xilobióz", "", ("xiloz", "D", "p", "b"), ("xiloz", "D", "p"), 4,
      desc="β-D-xilóz-(1→4)-D-xilóz, a xilán (hemicellulóz) bomlásterméke."),
    D("primeveroz", "Primeveróz", "", ("xiloz", "D", "p", "b"), ("glukoz", "D", "p"), 6,
      desc="β-D-xilóz-(1→6)-D-glükóz. Növényi glikozidokban, pl. a kankalinban fordul elő."),
    D("trehaloz", "Trehalóz", "gombacukor", ("glukoz", "D", "p", "a"), ("glukoz", "D", "p"), 1,
      banom="a",
      desc="Gombacukor. Nem redukáló diszacharid: a két α-D-glükóz glikozidos OH-csoportja "
           "kapcsolódik össze, ezért egyik gyűrű sem tud felnyílni. Gombákban, rovarokban "
           "fordul elő, véd a kiszáradás ellen."),
    D("kojibioz", "Kojibióz", "", ("glukoz", "D", "p", "a"), ("glukoz", "D", "p"), 2,
      desc="α-D-glükóz-(1→2)-D-glükóz. A koji-erjesztés (Aspergillus oryzae) során "
           "keletkezik, a mézben is megtalálható."),
    D("szoforoz", "Szoforóz", "", ("glukoz", "D", "p", "b"), ("glukoz", "D", "p"), 2,
      desc="β-D-glükóz-(1→2)-D-glükóz. Nevét a japánakácról (Sophora japonica) kapta."),
    D("nigeroz", "Nigeróz", "", ("glukoz", "D", "p", "a"), ("glukoz", "D", "p"), 3,
      desc="α-D-glükóz-(1→3)-D-glükóz, a nigerán (Aspergillus niger poliszacharidja) "
           "bomlásterméke."),
    D("laminaribioz", "Laminaribióz", "", ("glukoz", "D", "p", "b"), ("glukoz", "D", "p"), 3,
      desc="β-D-glükóz-(1→3)-D-glükóz, a barnamoszatok laminarinjának építőegysége."),
    D("maltoz", "Maltóz", "malátacukor", ("glukoz", "D", "p", "a"), ("glukoz", "D", "p"), 4,
      defv="a",
      desc="Malátacukor. A keményítő amilázos bontásakor keletkezik: két glükóz "
           "α(1→4) glikozidos kötéssel. Redukáló diszacharid."),
    D("cellobioz", "Cellobióz", "", ("glukoz", "D", "p", "b"), ("glukoz", "D", "p"), 4,
      desc="A cellulóz ismétlődő egysége: két glükóz β(1→4) glikozidos kötéssel. "
           "Redukáló diszacharid."),
    D("izomaltoz", "Izomaltóz", "", ("glukoz", "D", "p", "a"), ("glukoz", "D", "p"), 6,
      defv="a",
      desc="α-D-glükóz-(1→6)-D-glükóz. Ilyen kötés van az amilopektin és a glikogén "
           "elágazási pontjain."),
    D("gentiobioz", "Gentiobióz", "", ("glukoz", "D", "p", "b"), ("glukoz", "D", "p"), 6,
      desc="β-D-glükóz-(1→6)-D-glükóz. A sáfrány színanyagában (krocin) és a tárnics "
           "gyökerében fordul elő."),
    D("szacharoz", "Szacharóz", "répacukor, nádcukor", ("glukoz", "D", "p", "a"),
      ("fruktoz", "D", "f"), 2, banom="b",
      desc="Répacukor, nádcukor. Nem redukáló diszacharid: az α-D-glükóz és a "
           "β-D-fruktóz glikozidos OH-csoportja kapcsolódik össze α(1↔2)β kötéssel, "
           "ezért egyik gyűrű sem tud felnyílni."),
    D("turanoz", "Turanóz", "", ("glukoz", "D", "p", "a"), ("fruktoz", "D", "f"), 3,
      desc="α-D-glükóz-(1→3)-D-fruktóz, a szacharóz izomerje; a mézben is előfordul."),
    D("maltuloz", "Maltulóz", "", ("glukoz", "D", "p", "a"), ("fruktoz", "D", "f"), 4,
      desc="α-D-glükóz-(1→4)-D-fruktóz; a maltóz lúgos izomerizációjával keletkezik."),
    D("izomaltuloz", "Izomaltulóz", "palatinóz", ("glukoz", "D", "p", "a"),
      ("fruktoz", "D", "f"), 6,
      desc="Palatinóz. α-D-glükóz-(1→6)-D-fruktóz; a szacharóz enzimes átrendeződésével "
           "készül, lassan felszívódó édesítőszer."),
    D("mannobioz", "Mannobióz", "", ("mannoz", "D", "p", "b"), ("mannoz", "D", "p"), 4,
      desc="β-D-mannóz-(1→4)-D-mannóz, a mannánok (pl. konjak) bomlásterméke."),
    D("laktoz", "Laktóz", "tejcukor", ("galaktoz", "D", "p", "b"), ("glukoz", "D", "p"), 4,
      desc="Tejcukor. β-D-galaktóz-(1→4)-D-glükóz. Redukáló diszacharid; a vékonybélben "
           "a laktáz enzim bontja."),
    D("melibioz", "Melibióz", "", ("galaktoz", "D", "p", "a"), ("glukoz", "D", "p"), 6,
      desc="α-D-galaktóz-(1→6)-D-glükóz, a raffinóz (triszacharid) bomlásterméke."),
    D("allolaktoz", "Allolaktóz", "", ("galaktoz", "D", "p", "b"), ("glukoz", "D", "p"), 6,
      desc="β-D-galaktóz-(1→6)-D-glükóz; az E. coli laktóz-operonjának természetes "
           "induktora."),
    D("laktuloz", "Laktulóz", "", ("galaktoz", "D", "p", "b"), ("fruktoz", "D", "f"), 4,
      desc="β-D-galaktóz-(1→4)-D-fruktóz. Szintetikus diszacharid, hashajtóként alkalmazzák."),
    D("nacetillaktozamin", "N-acetillaktózamin", "LacNAc", ("galaktoz", "D", "p", "b"),
      ("nacetilglukozamin", "D", "p"), 4,
      desc="β-D-galaktóz-(1→4)-N-acetil-D-glükózamin; a glikoproteinek szénhidrát-láncainak "
           "gyakori egysége."),
    D("neoheszperidoz", "Neoheszperidóz", "", ("ramnoz", "L", "p", "a"), ("glukoz", "D", "p"), 2,
      desc="α-L-ramnóz-(1→2)-D-glükóz; a citrusfélék keserű flavonoid-glikozidjainak "
           "(pl. naringin) cukorrésze."),
    D("rutinoz", "Rutinóz", "", ("ramnoz", "L", "p", "a"), ("glukoz", "D", "p"), 6,
      desc="α-L-ramnóz-(1→6)-D-glükóz; a rutin és a heszperidin cukorrésze."),
    D("kitobioz", "Kitobióz", "", ("nacetilglukozamin", "D", "p", "b"),
      ("nacetilglukozamin", "D", "p"), 4,
      desc="Két N-acetil-D-glükózamin β(1→4) kötéssel; a kitin ismétlődő egysége."),
]

SUP = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
GREEK = {"a": "α", "b": "β"}
RING_WORD = {"p": "piran", "f": "furan"}


# ---------------------------------------------------------------------------
#  Egy monoszacharid-egység atomjai és kötései
# ---------------------------------------------------------------------------
class Unit:
    """Egy monoszacharid összes atomja, rögzített sorrendben.

    Az atomkészlet a nyílt és a gyűrűs formában azonos: gyűrűzáráskor a
    gyűrű-O hidrogénje átkerül a karbonil-O-ra (ebből lesz a glikozidos OH).
    """

    def __init__(self, spec, cfg="D", tag=""):
        self.spec = spec
        self.n = n = spec["n"]
        self.kind = spec["kind"]
        self.co = 1 if self.kind == "aldo" else 2
        self.cfg = cfg
        self.tag = tag
        mods = spec["mods"]
        self.atoms = []
        self.bonds = []
        self.C, self.X, self.Xd, self.HX, self.HC = {}, {}, {}, {}, {}
        self.extra = []  # acetil-csoport atomjai
        # Fischer-oldalak
        first = 2 if self.kind == "aldo" else 3
        self.sides = {}
        for i, ch in enumerate(spec["sides"]):
            if ch in "RL":
                s = ch
                if cfg == "L":
                    s = "L" if ch == "R" else "R"
                self.sides[first + i] = s

        def add(el, lab, c, role):
            self.atoms.append(dict(el=el, lab=lab + (tag if lab else ""), c=c, role=role))
            return len(self.atoms) - 1

        def bond(a, b, o=1):
            self.bonds.append((a, b, o))

        hplan = []  # (atom, label, carbon, role)
        self.lactyl = None

        def sulfo(host, ci):
            # –SO₃H csoport (szulfát-észter vagy N-szulfát)
            sa = add("S", f"S{ci}", ci, "Sub")
            bond(host, sa)
            for o in (2, 2, 1):
                oo = add("O", "", ci, "Sub")
                bond(sa, oo, o)
            hplan.append((oo, "", ci, "Sub"))
        for i in range(1, n + 1):
            self.C[i] = add("C", f"C{i}", i, "C")
        for i in range(1, n):
            bond(self.C[i], self.C[i + 1])
        for i in range(1, n + 1):
            m = mods.get(i)
            c = self.C[i]
            if i == self.co:
                self.X[i] = add("O", f"O{i}", i, "X")
                bond(c, self.X[i], 2)
                if i == 1:
                    hplan.append((c, f"H{i}", i, "HC"))
            elif i in (1, n):
                if m == "CH3":
                    for s in "abc":
                        hplan.append((c, f"H{i}{s}", i, "HC"))
                elif m == "anh":
                    # 3,6-anhidro-híd: a C6 a C3 oxigénjéhez kötődik
                    hplan.append((c, f"H{i}a", i, "HC"))
                    hplan.append((c, f"H{i}b", i, "HC"))
                elif m == "CH2OSO3H":
                    self.X[i] = add("O", f"O{i}", i, "X")
                    bond(c, self.X[i])
                    sulfo(self.X[i], i)
                    hplan.append((c, f"H{i}a", i, "HC"))
                    hplan.append((c, f"H{i}b", i, "HC"))
                elif m == "COOH":
                    self.Xd[i] = add("O", f"O{i}a", i, "Xd")
                    bond(c, self.Xd[i], 2)
                    self.X[i] = add("O", f"O{i}b", i, "X")
                    bond(c, self.X[i])
                    hplan.append((self.X[i], f"HO{i}", i, "HX"))
                else:
                    self.X[i] = add("O", f"O{i}", i, "X")
                    bond(c, self.X[i])
                    hplan.append((self.X[i], f"HO{i}", i, "HX"))
                    hplan.append((c, f"H{i}a", i, "HC"))
                    hplan.append((c, f"H{i}b", i, "HC"))
            else:
                if m == "H":
                    hplan.append((c, f"H{i}a", i, "HC"))
                    hplan.append((c, f"H{i}b", i, "HC"))
                elif m == "NH2":
                    self.X[i] = add("N", f"N{i}", i, "X")
                    bond(c, self.X[i])
                    hplan.append((self.X[i], f"HN{i}a", i, "HX"))
                    hplan.append((self.X[i], f"HN{i}b", i, "HX"))
                    hplan.append((c, f"H{i}", i, "HC"))
                elif m == "OSO3H":
                    self.X[i] = add("O", f"O{i}", i, "X")
                    bond(c, self.X[i])
                    sulfo(self.X[i], i)
                    hplan.append((c, f"H{i}", i, "HC"))
                elif m == "NHSO3H":
                    self.X[i] = add("N", f"N{i}", i, "X")
                    bond(c, self.X[i])
                    sulfo(self.X[i], i)
                    hplan.append((self.X[i], f"HN{i}", i, "HX"))
                    hplan.append((c, f"H{i}", i, "HC"))
                elif m == "Oanh":
                    self.X[i] = add("O", f"O{i}", i, "X")
                    bond(c, self.X[i])
                    hplan.append((c, f"H{i}", i, "HC"))
                elif m == "Olactyl":
                    # 3-O-[(R)-1-karboxietil] (laktil-éter, muraminsav)
                    xo = self.X[i] = add("O", f"O{i}", i, "X")
                    bond(c, xo)
                    ca = add("C", "", i, "Sub")
                    cm = add("C", "", i, "Sub")
                    cc = add("C", "", i, "Sub")
                    od = add("O", "", i, "Sub")
                    oh = add("O", "", i, "Sub")
                    bond(xo, ca)
                    bond(ca, cm)
                    bond(ca, cc)
                    bond(cc, od, 2)
                    bond(cc, oh)
                    hplan.append((ca, "", i, "Sub"))
                    for _ in range(3):
                        hplan.append((cm, "", i, "Sub"))
                    hplan.append((oh, "", i, "Sub"))
                    hplan.append((c, f"H{i}", i, "HC"))
                    self.lactyl = (ca, xo, cc, cm)
                elif m == "NHAc":
                    nn = self.X[i] = add("N", f"N{i}", i, "X")
                    bond(c, nn)
                    ca = add("C", "", i, "Ac")
                    oa = add("O", "", i, "Ac")
                    cm = add("C", "", i, "Ac")
                    self.extra += [ca, oa, cm]
                    bond(nn, ca)
                    bond(ca, oa, 2)
                    bond(ca, cm)
                    hplan.append((nn, f"HN{i}", i, "HX"))
                    for s in "abc":
                        hplan.append((cm, "", i, "Ac"))
                    hplan.append((c, f"H{i}", i, "HC"))
                else:
                    self.X[i] = add("O", f"O{i}", i, "X")
                    bond(c, self.X[i])
                    hplan.append((self.X[i], f"HO{i}", i, "HX"))
                    hplan.append((c, f"H{i}", i, "HC"))
        for host, lab, ci, role in hplan:
            h = add("H", lab, ci, role)
            bond(host, h)
            if role == "HX":
                self.HX.setdefault(ci, h)
            elif role == "HC":
                self.HC.setdefault(ci, []).append(h)
            if self.lactyl and host == self.lactyl[0] and len(self.lactyl) == 4:
                self.lactyl = self.lactyl + (h,)
        if mods.get(n) == "anh":
            bond(self.X[3], self.C[n])
        self.open_bonds = list(self.bonds)

    # -- gyűrűs forma -------------------------------------------------------
    def ring_k(self, ring):
        return self.co + (4 if ring == "p" else 3)

    def can_ring(self, ring):
        k = self.ring_k(ring)
        return k <= self.n and k in self.X and self.atoms[self.X[k]]["el"] == "O" \
            and k not in self.Xd

    def ring_bonds(self, ring):
        a, k = self.co, self.ring_k(ring)
        ca, oa, ok, h = self.C[a], self.X[a], self.X[k], self.HX[k]
        out = []
        for (i, j, o) in self.open_bonds:
            key = {i, j}
            if key == {ca, oa}:
                out.append((i, j, 1))
            elif key == {ok, h}:
                out.append((oa, h, 1))
            else:
                out.append((i, j, o))
        out.append((ca, ok, 1))
        return out

    def ring_meta(self, ring):
        a, k = self.co, self.ring_k(ring)
        ring_atoms = [self.C[i] for i in range(a, k + 1)] + [self.X[k]]
        return dict(a=a, k=k, aC=self.C[a], aO=self.X[a], rO=self.X[k], tH=self.HX[k],
                    ring=ring_atoms)

    def ref_side(self):
        return self.sides[max(self.sides)]

    # -- sztereokémia -------------------------------------------------------
    def fischer_specs(self):
        """Királis centrumok helyi elrendezése a Fischer-projekcióban.

        Függőleges kötések hátra, vízszintesek előre (a néző +z irányban áll).
        """
        specs = []
        for i, s in self.sides.items():
            sx = 1.0 if s == "R" else -1.0
            nb = {self.C[i - 1]: (0.0, 1.0, -0.6),
                  self.C[i + 1]: (0.0, -1.0, -0.6),
                  self.X[i]: (sx, 0.0, 0.6),
                  self.HC[i][0]: (-sx, 0.0, 0.6)}
            specs.append((self.C[i], nb))
        if self.lactyl:
            # (R)-laktil: a H hátra mutat, O → COOH → CH₃ az óramutató járása szerint
            ca, xo, cc, cm, h = self.lactyl
            specs.append((ca, {xo: (0.0, 1.0, 0.33), cc: (0.87, -0.5, 0.33),
                               cm: (-0.87, -0.5, 0.33), h: (0.0, 0.0, -1.0)}))
        return specs

    def anomer_spec(self, ring, anomer, exo=None):
        """Az anomer szénatom helyi elrendezése a Haworth-projekcióban.

        A gyűrű felülről nézve az óramutató járása szerint számozódik
        (anomer C jobbra, gyűrű-O hátul-jobbra).  A Fischer-projekcióban
        jobbra álló csoport a Haworth-képletben lefelé mutat; α-anomernél az
        anomer O a konfigurációs atom O-jával azonos oldalon áll (Fischer).
        """
        m = self.ring_meta(ring)
        a = m["a"]
        down_is_o = (anomer == "a") == (self.ref_side() == "R")
        exo = self.X[a] if exo is None else exo
        fourth = self.HC[1][0] if self.kind == "aldo" else self.C[1]
        zo = -1.0 if down_is_o else 1.0
        nb = {m["rO"]: (-0.5, 0.87, 0.0),
              self.C[a + 1]: (-0.5, -0.87, 0.0),
              exo: (0.6, 0.0, zo),
              fourth: (0.6, 0.0, -zo)}
        return (m["aC"], nb)

    # -- kiemelendő csoportok ---------------------------------------------------
    def groups(self, ring):
        m = self.ring_meta(ring)
        k = m["k"]
        ficak = [i for i, at in enumerate(self.atoms) if at["c"] > k]
        kamu = [i for i, at in enumerate(self.atoms) if at["c"] == 1] if self.co == 2 else []
        return dict(glyc=[m["aO"], m["tH"]], ringO=[m["rO"]], ficak=ficak, kamu=kamu)

    def hydroxyls(self, bonds):
        """(O, H) párok a megadott kötéslistában."""
        adj = {}
        for i, j, _ in bonds:
            adj.setdefault(i, []).append(j)
            adj.setdefault(j, []).append(i)
        out = []
        for i, at in enumerate(self.atoms):
            if at["el"] != "O":
                continue
            hs = [j for j in adj.get(i, []) if self.atoms[j]["el"] == "H"]
            if hs:
                out.append((i, hs[0]))
        return out


# ---------------------------------------------------------------------------
#  RDKit segédfüggvények
# ---------------------------------------------------------------------------
def make_mol(els, bonds):
    rw = Chem.RWMol()
    for el in els:
        a = Chem.Atom(el)
        a.SetNoImplicit(True)
        rw.AddAtom(a)
    for i, j, o in bonds:
        rw.AddBond(int(i), int(j), Chem.BondType.DOUBLE if o == 2 else Chem.BondType.SINGLE)
    m = rw.GetMol()
    Chem.SanitizeMol(m)
    return m


def apply_stereo(mol, specs):
    """Királis jelölések beállítása helyi (vázlatos) 3D elrendezésekből."""
    n = mol.GetNumAtoms()
    rng = np.random.RandomState(7)
    base = rng.uniform(-60, 60, size=(n, 3))
    tags = {}
    for center, nb in specs:
        real = {x.GetIdx() for x in mol.GetAtomWithIdx(center).GetNeighbors()}
        assert real == set(nb), (center, real, set(nb))
        conf = Chem.Conformer(n)
        for i in range(n):
            conf.SetAtomPosition(i, base[i].tolist())
        conf.SetAtomPosition(center, (0.0, 0.0, 0.0))
        for j, p in nb.items():
            conf.SetAtomPosition(j, p)
        m2 = Chem.Mol(mol)
        m2.RemoveAllConformers()
        cid = m2.AddConformer(conf, assignId=True)
        Chem.AssignAtomChiralTagsFromStructure(m2, cid)
        tags[center] = m2.GetAtomWithIdx(center).GetChiralTag()
    for a in mol.GetAtoms():
        a.SetChiralTag(Chem.ChiralType.CHI_UNSPECIFIED)
    for c, t in tags.items():
        mol.GetAtomWithIdx(c).SetChiralTag(t)
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    for c in tags:
        assert mol.GetAtomWithIdx(c).HasProp("_CIPCode"), f"atom {c} nem királis"


def cip(mol):
    m = Chem.Mol(mol)
    rdCIPLabeler.AssignCIPLabels(m)
    return {a.GetIdx(): a.GetProp("_CIPCode") for a in m.GetAtoms() if a.HasProp("_CIPCode")}


def legacy_cip(mol):
    return {a.GetIdx(): a.GetProp("_CIPCode") for a in mol.GetAtoms() if a.HasProp("_CIPCode")}


def stereo_ok(mol, cid, ref):
    m = Chem.Mol(mol, confId=cid)
    Chem.AssignStereochemistryFrom3D(m, confId=cid)
    return legacy_cip(m) == ref


def coords(mol, cid):
    return np.array(mol.GetConformer(cid).GetPositions())


def ring_signs(P, ring):
    Q = P[ring] - P[ring].mean(0)
    nrm = np.zeros(3)
    for i in range(len(ring)):
        nrm += np.cross(Q[i], Q[(i + 1) % len(ring)])
    up = -nrm / np.linalg.norm(nrm)  # Haworth "fel": felülről nézve óramutató járása
    return Q @ up


def chair(P, ring):
    if len(ring) != 6:
        return "env"
    d = ring_signs(P, ring)
    if np.all(np.abs(d) > 0.12):
        s = "".join("+" if v > 0 else "-" for v in d)
        if s == "-+-+-+":
            return "4C1"
        if s == "+-+-+-":
            return "1C4"
    return "other"


def embed(mol, n, seed):
    p = AllChem.ETKDGv3()
    p.randomSeed = seed
    p.useSmallRingTorsions = True
    p.pruneRmsThresh = 0.25
    p.numThreads = 0
    cids = list(AllChem.EmbedMultipleConfs(mol, n, p))
    if not cids:
        raise RuntimeError("beágyazás sikertelen")
    res = AllChem.MMFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=10000)
    return [(cid, e) for cid, (conv, e) in zip(cids, res)]


def pick(mol, confs, ref, prefer=None, window=4.0):
    """A legkisebb energiájú, helyes sztereokémiájú konformer; ha `prefer`
    adott, akkor az azt teljesítők közül (ha az ablakon belül van)."""
    ok = [(e, cid) for cid, e in confs if stereo_ok(mol, cid, ref)]
    if not ok:
        raise RuntimeError("nincs helyes sztereokémiájú konformer")
    ok.sort()
    if prefer:
        good = [(e, cid) for e, cid in ok if prefer(coords(mol, cid))]
        if good and good[0][0] - ok[0][0] <= window:
            return good[0][1], good[0][0]
    return ok[0][1], ok[0][0]


def mmff_energy(mol, cid):
    mp = AllChem.MMFFGetMoleculeProperties(mol)
    ff = AllChem.MMFFGetMoleculeForceField(mol, mp, confId=cid)
    return ff.CalcEnergy()


def zigzag(mol, dihs, fixed=(), seeds=None, cids=None):
    """Szénlánc cikcakk-alakra kényszerítése (minden váz-torzió ~180°)."""
    mp = AllChem.MMFFGetMoleculeProperties(mol)
    best = None
    for cid in cids:
        conf = mol.GetConformer(cid)
        for (a, b, c, d) in dihs:
            MT.SetDihedralDeg(conf, a, b, c, d, 180.0)
        ff = AllChem.MMFFGetMoleculeForceField(mol, mp, confId=cid)
        for (a, b, c, d) in dihs:
            ff.MMFFAddTorsionConstraint(a, b, c, d, False, 176.0, 184.0, 500.0)
        for f in fixed:
            ff.AddFixedPoint(int(f))
        ff.Minimize(maxIts=20000)
        e = mmff_energy(mol, cid)
        if best is None or e < best[0]:
            best = (e, cid)
    return best[1], best[0]


def rot_rows(x, y, z):
    return np.vstack([x, y, z])


def frame_haworth(P, ring, ring_type):
    Q = P[ring] - P[ring].mean(0)
    nrm = np.zeros(3)
    for i in range(len(ring)):
        nrm += np.cross(Q[i], Q[(i + 1) % len(ring)])
    up = -nrm / np.linalg.norm(nrm)
    o = Q[-1] - (Q[-1] @ up) * up
    o /= np.linalg.norm(o)
    ang = math.radians(60 if ring_type == "p" else 90)
    east = o * math.cos(ang) - np.cross(up, o) * math.sin(ang)
    east /= np.linalg.norm(east)
    z = np.cross(east, up)
    return rot_rows(east, up, z)


def frame_open(P, carbons, hetero):
    C = P[carbons]
    c = C.mean(0)
    Q = C - c
    _, _, vt = np.linalg.svd(Q)
    ax, nz = vt[0], vt[2]
    if (C[0] - C[-1]) @ ax < 0:
        ax = -ax
    if len(hetero) and ((P[hetero] - c) @ nz).sum() < 0:
        nz = -nz
    y = np.cross(nz, ax)
    return rot_rows(ax, y, nz)


def apply_frame(P, Rm, center):
    return (P - center) @ Rm.T


def kabsch(Pm, Qm):
    """Merev transzformáció (R, t), amely Pm-et Qm-re illeszti."""
    pc, qc = Pm.mean(0), Qm.mean(0)
    H = (Pm - pc).T @ (Qm - qc)
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Dm = np.diag([1, 1, d])
    Rm = Vt.T @ Dm @ U.T
    return Rm, qc - pc @ Rm.T


def flat(P):
    return [round(float(v), 3) for v in np.asarray(P).reshape(-1)]


def formula(els):
    cnt = {}
    for e in els:
        cnt[e] = cnt.get(e, 0) + 1
    s = ""
    for e in ("C", "H", "N", "O", "S"):
        if e in cnt:
            s += e + (str(cnt[e]) if cnt[e] > 1 else "")
    mass = sum({"C": 12.011, "H": 1.008, "N": 14.007, "O": 15.999, "S": 32.06}[e] for e in els)
    return s.translate(SUP), round(mass, 2)


# ---------------------------------------------------------------------------
#  Monoszacharidok generálása
# ---------------------------------------------------------------------------
RING_CACHE = {}


def ring_name(spec, ring, anomer, cfg="{cfg}", word="óz"):
    suffix = spec["suffix"] if word == "óz" else word
    if spec["suffix"] == "uronsav" and word != "óz":
        suffix = "uronozil" if word == "ozil" else "uronozid"
    return f'{spec["prefix"]}{GREEK[anomer]}-{cfg}-{spec["stem"]}{RING_WORD[ring]}{suffix}'


def mono_ring(spec, cfg, ring, anomer, nconf=80):
    """Egy monoszacharid gyűrűs formája (RDKit mol, konformer, metaadatok)."""
    key = (spec["id"], cfg, ring, anomer)
    if key in RING_CACHE:
        return RING_CACHE[key]
    u = Unit(spec, cfg)
    bonds = u.ring_bonds(ring)
    mol = make_mol([a["el"] for a in u.atoms], bonds)
    apply_stereo(mol, u.fischer_specs() + [u.anomer_spec(ring, anomer)])
    ref = legacy_cip(mol)
    confs = embed(mol, nconf, 1234)
    meta = u.ring_meta(ring)
    prefer = None
    if ring == "p":
        want = "4C1" if cfg == "D" else "1C4"
        if u.kind == "aldo":
            prefer = lambda P: chair(P, meta["ring"]) == want
        else:
            prefer = lambda P: chair(P, meta["ring"]) in ("4C1", "1C4")
    # Aldopiranózoknál a tankönyvi 4C1 (L-sorban 1C4) széket részesítjük előnyben
    cid, e = pick(mol, confs, ref, prefer, window=10.0 if u.kind == "aldo" else 4.0)
    P = coords(mol, cid)
    out = dict(unit=u, mol=mol, bonds=bonds, P=P, meta=meta, energy=e,
               chair=chair(P, meta["ring"]))
    RING_CACHE[key] = out
    return out


def mono_open(spec, cfg="D", nconf=60):
    u = Unit(spec, cfg)
    mol = make_mol([a["el"] for a in u.atoms], u.open_bonds)
    apply_stereo(mol, u.fischer_specs())
    ref = legacy_cip(mol)
    confs = embed(mol, nconf, 4321)
    good = [cid for cid, e in confs if stereo_ok(mol, cid, ref)]
    n = u.n
    dihs = [(u.C[i], u.C[i + 1], u.C[i + 2], u.C[i + 3]) for i in range(1, n - 2)]
    cid, e = zigzag(mol, dihs, cids=good[:25])
    assert stereo_ok(mol, cid, ref)
    return u, mol, coords(mol, cid)


def build_mono(spec):
    u, omol, P_open = mono_open(spec)
    els = [a["el"] for a in u.atoms]
    het = [i for i, a in enumerate(u.atoms) if a["el"] in "ON"]
    carb = [u.C[i] for i in range(1, u.n + 1)]
    Ro = frame_open(P_open, carb, het)
    X_open = apply_frame(P_open, Ro, P_open.mean(0))
    fml, mass = formula(els)
    rec = dict(id=spec["id"], name=spec["name"], alt=spec["alt"], n=spec["n"],
               kind=spec["kind"], sub=spec["sub"], cfg=spec["cfg"], desc=spec["desc"],
               formula=fml, mass=mass,
               el=els, lab=[a["lab"] for a in u.atoms],
               bb=[1 if a["role"] == "C" else 0 for a in u.atoms],
               open=dict(b=[list(b) for b in u.open_bonds], x=flat(X_open)),
               ohs0=[list(p) for p in u.hydroxyls(u.open_bonds)],
               v=[])
    for ring in spec["rings"]:
        if not u.can_ring(ring):
            continue
        for an in ("a", "b"):
            r = mono_ring(spec, "D", ring, an)
            meta = r["meta"]
            P = r["P"]
            Rh = frame_haworth(P, meta["ring"], ring)
            X = apply_frame(P, Rh, P.mean(0))
            g = u.groups(ring)
            ingroup = set(sum(g.values(), []))
            ohs = [list(p) for p in u.hydroxyls(r["bonds"])
                   if p[0] not in ingroup and p[1] not in ingroup]
            a, k = meta["a"], meta["k"]
            mid = (a + k) // 2
            rec["v"].append(dict(
                key=f"{ring}-{an}", ring=ring, an=an,
                name=ring_name(spec, ring, an),
                b=[list(b) for b in r["bonds"]], x=flat(X),
                ringIdx=meta["ring"], aC=meta["aC"], aO=meta["aO"], rO=meta["rO"],
                tH=meta["tH"], tHo=[meta["rO"], u.C[k], u.C[k - 1]],
                tHr=[meta["aO"], meta["aC"], u.C[a + 1]],
                root=[u.C[mid], u.C[mid + 1], u.C[mid - 1]],
                g=g, ohs=ohs, chair=r["chair"]))
            print(f'  {spec["name"]:<20} {ring}-{an}  E={r["energy"]:8.2f}  {r["chair"]}')
    if rec["v"]:
        keys = [v["key"] for v in rec["v"]]
        rec["defv"] = spec["defv"] if spec["defv"] in keys else (
            "p-a" if "p-a" in keys else keys[0])
    return rec


# ---------------------------------------------------------------------------
#  Diszacharidok generálása
# ---------------------------------------------------------------------------
def build_di_variant(d, banom):
    sA = MONO_BY_ID[d["A"][0]]
    sB = MONO_BY_ID[d["B"][0]]
    cfgA, ringA, anA = d["A"][1], d["A"][2], d["A"][3]
    cfgB, ringB = d["B"][1], d["B"][2]
    uA = Unit(sA, cfgA, "")
    uB = Unit(sB, cfgB, "′")
    mA, mB = uA.ring_meta(ringA), uB.ring_meta(ringB)
    x = d["x"]
    nonred = (x == uB.co)
    oB = uB.X[x]
    bA, bB = uA.ring_bonds(ringA), uB.ring_bonds(ringB)
    hB = mB["tH"] if nonred else uB.HX[x]
    gA = {mA["aO"], mA["tH"]}
    gB = {hB}
    nA = len(uA.atoms)
    # Új indexek: megtartott A-atomok, megtartott B-atomok, majd a "szellem"
    # atomok (a kilépő víz: A glikozidos OH-ja és B H-ja).
    idx = {}
    order = []
    for i in range(nA):
        if i not in gA:
            idx[("A", i)] = len(order)
            order.append(("A", i))
    for i in range(len(uB.atoms)):
        if i not in gB:
            idx[("B", i)] = len(order)
            order.append(("B", i))
    N = len(order)
    ghosts = [("A", mA["aO"]), ("A", mA["tH"]), ("B", hB)]
    for gkey in ghosts:
        idx[gkey] = len(order)
        order.append(gkey)
    units = {"A": uA, "B": uB}

    def remap(bonds, u, ex):
        return [(idx[(u, i)], idx[(u, j)], o) for i, j, o in bonds if i not in ex and j not in ex]

    glyc_bond = (idx[("A", mA["aC"])], idx[("B", oB)], 1)
    ring_bonds = remap(bA, "A", gA) + remap(bB, "B", gB) + [glyc_bond]
    els = [units[u].atoms[i]["el"] for u, i in order]
    mol = make_mol(els[:N], ring_bonds)

    def remap_specs(specs, u):
        return [(idx[(u, c)], {idx[(u, j)]: p for j, p in nb.items()}) for c, nb in specs]

    # A anomer centruma: a glikozidos O B-hez tartozik
    cA, nbA = uA.anomer_spec(ringA, anA, exo=-1)
    nbA2 = {}
    for j, p in nbA.items():
        nbA2[idx[("B", oB)] if j == -1 else idx[("A", j)]] = p
    anB = banom if banom else d["_anB"]
    specs = remap_specs(uA.fischer_specs(), "A") + [(idx[("A", cA)], nbA2)] \
        + remap_specs(uB.fischer_specs(), "B") \
        + remap_specs([uB.anomer_spec(ringB, anB)], "B")
    apply_stereo(mol, specs)
    ref = legacy_cip(mol)
    if d["id"] == "szacharoz":
        # (2R,3R,4S,5S,6R)-2-[(2S,3S,4S,5R)-...-oxolan-2-yl]oxy-...-oxane-3,4,5-triol
        lab = cip(mol)
        got = [lab[idx[("A", uA.C[i])]] for i in range(1, 6)] + \
              [lab[idx[("B", uB.C[i])]] for i in range(2, 6)]
        assert got == list("RRSSR") + list("SSSR"), got
        print("  OK szacharóz CIP:", "".join(got))
    # -- gyűrűs (zárt) forma
    confs = embed(mol, 200, 99)
    ringA_i = [idx[("A", i)] for i in mA["ring"]]
    ringB_i = [idx[("B", i)] for i in mB["ring"]]

    def chair_ok(P):
        ok = True
        for u, s, rg, cfg, ring in (("A", sA, ringA_i, cfgA, ringA), ("B", sB, ringB_i, cfgB, ringB)):
            if ring != "p":
                continue
            want = "4C1" if cfg == "D" else "1C4"
            ct = chair(P, rg)
            if s["kind"] == "aldo":
                ok = ok and ct == want
            else:
                ok = ok and ct in ("4C1", "1C4")
        return ok

    cid, e = pick(mol, confs, ref, chair_ok, window=6.0)
    P = coords(mol, cid)
    # Megjelenítési keret: A balra, B jobbra, A gyűrűje Haworth-állásban
    cA_ = P[ringA_i].mean(0)
    cB_ = P[ringB_i].mean(0)
    xv = cB_ - cA_
    xv /= np.linalg.norm(xv)
    upA = frame_haworth(P, ringA_i, ringA)[1]
    yv = upA - (upA @ xv) * xv
    yv /= np.linalg.norm(yv)
    zv = np.cross(xv, yv)
    Rd = rot_rows(xv, yv, zv)
    center = P.mean(0)
    X_ring = apply_frame(P, Rd, center)

    # -- csoportok
    def gmap(lst, u):
        return [idx[(u, i)] for i in lst if (u, i) in idx and idx[(u, i)] < N]
    grA, grB = uA.groups(ringA), uB.groups(ringB)
    groups = dict(glyc=[] if nonred else gmap(grB["glyc"], "B"),
                  ringO=gmap(grA["ringO"], "A") + gmap(grB["ringO"], "B"),
                  ficak=gmap(grA["ficak"], "A") + gmap(grB["ficak"], "B"),
                  kamu=gmap(grA["kamu"], "A") + gmap(grB["kamu"], "B"),
                  bridge=[idx[("B", oB)]])
    ingroup = set(sum(groups.values(), []))
    adj = {}
    for i, j, _ in ring_bonds:
        adj.setdefault(i, []).append(j)
        adj.setdefault(j, []).append(i)
    ohs = []
    for i in range(N):
        if els[i] == "O" and i not in ingroup:
            hs = [j for j in adj.get(i, []) if els[j] == "H"]
            if hs and hs[0] not in ingroup:
                ohs.append([i, hs[0]])

    var = dict(key=anB, an=anB, b=[list(b) for b in ring_bonds], x=flat(X_ring),
               ringA=ringA_i, ringB=ringB_i, g=groups, ohs=ohs, N=N,
               chairs=[chair(P, ringA_i), chair(P, ringB_i)])

    # -- nyílt forma (csak redukáló diszacharid: B gyűrűje felnyílik)
    if not nonred:
        aB, kB = mB["a"], mB["k"]
        open_bonds = remap(bA, "A", gA) + remap(uB.open_bonds, "B", gB) + [glyc_bond]
        omol = make_mol(els[:N], open_bonds)
        ospecs = remap_specs(uA.fischer_specs(), "A") + [(idx[("A", cA)], nbA2)] \
            + remap_specs(uB.fischer_specs(), "B")
        apply_stereo(omol, ospecs)
        oref = legacy_cip(omol)
        conf = Chem.Conformer(mol.GetConformer(cid))
        th, ok_, ck = idx[("B", mB["tH"])], idx[("B", mB["rO"])], idx[("B", uB.C[kB])]
        v = P[ok_] - P[ck]
        conf.SetAtomPosition(th, (P[ok_] + 0.97 * v / np.linalg.norm(v)).tolist())
        omol.RemoveAllConformers()
        ocid = omol.AddConformer(conf, assignId=True)
        dihs = [(idx[("B", uB.C[i])], idx[("B", uB.C[i + 1])], idx[("B", uB.C[i + 2])],
                 idx[("B", uB.C[i + 3])]) for i in range(1, uB.n - 2)]
        fixed = [idx[("A", i)] for i in range(nA) if i not in gA
                 and uA.atoms[i]["el"] != "H"]
        # A-t rögzítjük, hogy a gyűrűzáródás alatt ne mozduljon
        ocid, oe = zigzag(omol, dihs, fixed=[], cids=[ocid])
        PO = coords(omol, ocid)
        Rk, tk = kabsch(PO[fixed], P[fixed])
        PO = PO @ Rk.T + tk
        assert stereo_ok(omol, ocid, oref)
        # Második kör: A atomjait pontosan a zárt forma helyére tesszük, majd
        # B-t újra relaxáljuk A rögzítésével.
        conf2 = omol.GetConformer(ocid)
        for i in range(N):
            conf2.SetAtomPosition(i, PO[i].tolist())
        for f in fixed:
            conf2.SetAtomPosition(f, P[f].tolist())
        mp = AllChem.MMFFGetMoleculeProperties(omol)
        ff = AllChem.MMFFGetMoleculeForceField(omol, mp, confId=ocid)
        for (a, b, c, dd) in dihs:
            ff.MMFFAddTorsionConstraint(a, b, c, dd, False, 176.0, 184.0, 500.0)
        for f in fixed:
            ff.AddFixedPoint(f)
        ff.Minimize(maxIts=20000)
        PO = coords(omol, ocid)
        assert stereo_ok(omol, ocid, oref)
        var["open"] = dict(b=[list(b) for b in open_bonds], x=flat(apply_frame(PO, Rd, center)))
        var["aC"], var["aO"], var["rO"] = idx[("B", mB["aC"])], idx[("B", mB["aO"])], ok_
        var["tH"] = th
        var["tHo"] = [ok_, ck, idx[("B", uB.C[kB - 1])]]
        var["tHr"] = [idx[("B", mB["aO"])], idx[("B", mB["aC"])], idx[("B", uB.C[aB + 1])]]
        var["root"] = [idx[("A", uA.C[3])], idx[("A", uA.C[4])], idx[("A", uA.C[2])]]

    # -- kondenzáció: két különálló monoszacharid -> diszacharid + víz
    rA = mono_ring(sA, cfgA, ringA, anA)
    rB = mono_ring(sB, cfgB, ringB, anB)
    free = np.zeros((N + 3, 3))
    for u, r in (("A", rA), ("B", rB)):
        common = [i for i in range(len(units[u].atoms))
                  if (u, i) in idx and idx[(u, i)] < N and units[u].atoms[i]["el"] != "H"]
        Rk, tk = kabsch(r["P"][common], P[[idx[(u, i)] for i in common]])
        Pf = r["P"] @ Rk.T + tk
        for i in range(len(units[u].atoms)):
            if (u, i) in idx:
                free[idx[(u, i)]] = Pf[i]
    ob = P[idx[("B", oB)]]
    w = 2 * ob - cA_ - cB_
    w -= (w @ xv) * xv
    if np.linalg.norm(w) < 1e-3:
        w = np.cross(xv, [0, 0, 1.0])
    w /= np.linalg.norm(w)
    perp = np.cross(xv, w)
    ang = math.radians(52.25)

    def water(c):
        return [c, c + 0.96 * (math.cos(ang) * w + math.sin(ang) * perp),
                c + 0.96 * (math.cos(ang) * w - math.sin(ang) * perp)]
    mid = water(ob + 3.0 * w)
    end = water(ob + 9.0 * w)
    var["cond"] = dict(
        free=flat(apply_frame(free, Rd, center)),
        u=flat(xv @ Rd.T),
        gMid=flat(apply_frame(np.array(mid), Rd, center)),
        gEnd=flat(apply_frame(np.array(end), Rd, center)),
        side=[0 if order[i][0] == "A" else 1 for i in range(N + 3)],
        newBond=[glyc_bond[0], glyc_bond[1]],
        gBonds=[[idx[("A", mA["aC"])], N, 0], [N, N + 1, 1], [idx[("B", oB)], N + 2, 0],
                [N, N + 2, 2]])
    lab = [units[u].atoms[i]["lab"] for u, i in order]
    bb = [1 if units[u].atoms[i]["role"] == "C" else 0 for u, i in order]
    print(f'  {d["name"]:<20} {anB}  E={e:8.2f}  {var["chairs"]}')
    return var, els, lab, bb, order


def build_di(d):
    sA = MONO_BY_ID[d["A"][0]]
    sB = MONO_BY_ID[d["B"][0]]
    uB = Unit(sB, d["B"][1])
    nonred = d["x"] == uB.co
    anoms = [d["banom"]] if nonred else ["a", "b"]
    variants = []
    els = lab = bb = None
    for an in anoms:
        d["_anB"] = an
        var, els, lab, bb, order = build_di_variant(d, d["banom"] if nonred else None)
        variants.append(var)
    N = variants[0]["N"]
    fml, mass = formula(els[:N])
    cfgA, ringA, anA = d["A"][1], d["A"][2], d["A"][3]
    cfgB, ringB = d["B"][1], d["B"][2]
    arrow = "↔" if nonred else "→"
    link_short = f"{GREEK[anA]}({Unit(sA).co}{arrow}{d['x']})"
    if nonred:
        link_short += GREEK[d["banom"]]
    a_name = ring_name(sA, ringA, anA, cfgA, "ozil")
    for v in variants:
        if nonred:
            b_name = ring_name(sB, ringB, v["an"], cfgB, "ozid")
        else:
            b_name = ring_name(sB, ringB, v["an"], cfgB)
        v["name"] = f"{a_name}-({Unit(sA).co}{arrow}{d['x']})-{b_name}"
        v["common"] = d["name"].lower() if nonred else f'{GREEK[v["an"]]}-{d["name"].lower()}'
    return dict(id=d["id"], name=d["name"], alt=d["alt"], A=d["A"][0], B=d["B"][0],
                cfgA=cfgA, cfgB=cfgB, link=link_short, reducing=not nonred, desc=d["desc"],
                formula=fml, mass=mass, el=els, lab=lab, bb=bb, v=variants,
                defv=(d["banom"] if nonred else d["defv"]))


# ---------------------------------------------------------------------------
#  Ellenőrzés ismert CIP-jelölésekkel
# ---------------------------------------------------------------------------
def validate():
    checks = [
        # (mono, gyűrű, anomer, cfg, {szénatom: CIP})
        ("glukoz", None, None, "D", {2: "R", 3: "S", 4: "R", 5: "R"}),
        ("fruktoz", None, None, "D", {3: "S", 4: "R", 5: "R"}),
        ("riboz", None, None, "D", {2: "R", 3: "R", 4: "R"}),
        ("glicerinaldehid", None, None, "D", {2: "R"}),
        ("glukoz", "p", "a", "D", {1: "S", 2: "R", 3: "S", 4: "S", 5: "R"}),
        ("glukoz", "p", "b", "D", {1: "R", 2: "R", 3: "S", 4: "S", 5: "R"}),
        ("galaktoz", "p", "a", "D", {1: "S", 2: "R", 3: "S", 4: "R", 5: "R"}),
        ("mannoz", "p", "a", "D", {1: "S", 2: "S", 3: "S", 4: "S", 5: "R"}),
        ("fruktoz", "f", "b", "D", {2: "R", 3: "S", 4: "S", 5: "R"}),
        ("fruktoz", "p", "b", "D", {2: "R", 3: "S", 4: "R", 5: "R"}),
        ("riboz", "f", "b", "D", {1: "R", 2: "R", 3: "S", 4: "R"}),
        ("ramnoz", "p", "a", "L", {1: "R", 2: "R", 3: "R", 4: "R", 5: "S"}),
        ("fukoz", "p", "a", "L", {1: "R", 2: "S", 3: "R", 4: "S", 5: "S"}),
    ]
    bad = 0
    for mid, ring, an, cfg, exp in checks:
        spec = MONO_BY_ID[mid]
        u = Unit(spec, cfg)
        if ring:
            mol = make_mol([a["el"] for a in u.atoms], u.ring_bonds(ring))
            apply_stereo(mol, u.fischer_specs() + [u.anomer_spec(ring, an)])
        else:
            mol = make_mol([a["el"] for a in u.atoms], u.open_bonds)
            apply_stereo(mol, u.fischer_specs())
        lab = cip(mol)
        got = {c: lab.get(u.C[c]) for c in exp}
        st = "OK " if got == exp else "HIBA"
        if got != exp:
            bad += 1
        print(f"  {st} {cfg}-{mid} {ring or 'nyílt'} {an or ''}: {got}")
    # Szacharóz: (2R,3R,4S,5S,6R)-2-[(2S,3S,4S,5R)-...oxolan-2-yl]oxy-...oxane
    return bad


def main():
    print("CIP-ellenőrzés:")
    if validate():
        print("Sztereokémiai hiba!", file=sys.stderr)
        sys.exit(1)
    print("Monoszacharidok:")
    monos = [build_mono(s) for s in MONOS]
    print("Diszacharidok:")
    dis = [build_di(d) for d in DIS]
    data = dict(monos=monos, dis=dis)
    # a poliszacharidokat a generate_polys.py állítja elő; ha már vannak, megtartjuk
    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.loads(f.read().split("window.SUGAR_DATA = ", 1)[1].rstrip().rstrip(";"))
        if "polys" in old:
            data["polys"] = old["polys"]
    except (OSError, IndexError, ValueError):
        pass
    js = "/* Automatikusan generált fájl – lásd tools/generate_data.py */\n" \
         "window.SUGAR_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Kiírva: {os.path.normpath(OUT)} ({len(js) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
