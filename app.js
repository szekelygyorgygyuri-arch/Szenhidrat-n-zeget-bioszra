// Szénhidrát 3D – megjelenítés és kezelőfelület
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeClosure, makeCondensation, makeStatic, makeGrowth, approachDirs, smooth, TIMING } from "./kinematics.js";
import {
  makePaperClosure, makePaperClosureDi, makePaperDiStatic, makePaperFischer, paperCondensationInput,
  alignOnto, PAPER_T, polyLayout,
} from "./paper.js";

const DATA = window.SUGAR_DATA;
const $ = (s) => document.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------------------
//  Katalógus
// ---------------------------------------------------------------------------
const MONO = new Map(DATA.monos.map((m) => [m.id, m]));
const MONO_IDX = new Map(DATA.monos.map((m, i) => [m.id, i]));
const DI = new Map(DATA.dis.map((d) => [d.id, d]));
const POLYS = DATA.polys || [];
const POLY = new Map(POLYS.map((p) => [p.id, p]));
const POLY_GROUPS = [
  ["glukan", "Glükánok (glükózból)"],
  ["fruktan", "Fruktánok (fruktózból)"],
  ["homo", "Egyéb homopoliszacharidok"],
  ["hetero", "Heteropoliszacharidok"],
];
const POLY_GROUP = Object.fromEntries(POLY_GROUPS);
const CLS = { 3: "Triózok", 4: "Tetrózok", 5: "Pentózok", 6: "Hexózok", 7: "Heptózok" };
const CLS1 = { 3: "Trióz", 4: "Tetróz", 5: "Pentóz", 6: "Hexóz", 7: "Heptóz" };
const SUBS = ["aldo", "keto", "dezoxi", "amino", "uron"];
const SUB = { aldo: "Aldózok", keto: "Ketózok", dezoxi: "Dezoxicukrok", amino: "Aminocukrok", uron: "Uronsavak" };
const SUB1 = { aldo: "aldóz", keto: "ketóz", dezoxi: "dezoxicukor", amino: "aminocukor", uron: "uronsav" };
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
const subNum = (n) => String(n).replace(/\d/g, (d) => SUBSCRIPT[d]);
const GREEK = { a: "α", b: "β" };
/** Névelő szám előtt: „az 1”, „az 5”, „az 50”, különben „a 2” (mondat elején nagybetűvel). */
const azA = (n, cap) => {
  const az = n === 1 || n === 5 || (n >= 50 && n < 60) || (n >= 500 && n < 600) || (n >= 1000 && n < 2000);
  return cap ? (az ? "Az" : "A") : az ? "az" : "a";
};

const GROUPS = [
  { key: "glyc", name: "Glikozidos OH", hint: "az anomer C-atom OH-csoportja", color: "#f2b705" },
  { key: "ringO", name: "Gyűrű-O", hint: "a glikozidos OH melletti gyűrű-oxigén", color: "#ec3f9f" },
  { key: "ficak", name: "Ficak", hint: "a gyűrű-O túloldalán kiálló C-ág (pl. –CH₂OH)", color: "#1fb35b" },
  { key: "kamu", name: "Kamuficak", hint: "ketózoknál az anomer C-atom –CH₂OH-ja", color: "#14b4cc" },
  { key: "bridge", name: "Glikozidos kötés O-ja", hint: "a két egységet összekötő oxigénhíd", color: "#7b5cff" },
];
const GROUP = Object.fromEntries(GROUPS.map((g) => [g.key, g]));
const PRIORITY = ["ficak", "kamu", "ringO", "glyc", "bridge"]; // a későbbi felülírja a korábbit
const EL_DEFAULT = { C: "#5f6877", O: "#e23b3b", H: "#eef1f5", N: "#3d6fe0", S: "#e0b11f" };
const ELS = ["C", "O", "H", "N", "S"];

const RADII = {
  bs: { C: 0.3, O: 0.28, N: 0.29, H: 0.18, S: 0.34, bond: 0.085, dbl: 0.06, off: 0.075 },
  st: { C: 0.13, O: 0.13, N: 0.13, H: 0.1, S: 0.13, bond: 0.13, dbl: 0.07, off: 0.1 },
  sf: { C: 1.55, O: 1.38, N: 1.42, H: 1.0, S: 1.8, bond: 0, dbl: 0, off: 0 },
};

// ---------------------------------------------------------------------------
//  Beállítások (böngészőben megjegyezve)
// ---------------------------------------------------------------------------
// Beállítások: a nézegető (SV) és a tippelő (SQ) megjelenítési beállításai
// külön élnek; a tippelő az elején a nézegetőéit veszi át. A közös adatok
// (csillagok, X-ek, pontszám, tippelő-beállítások) az SH-ban vannak.
const STORE = "szenhidrat3d.v2";
const DEFAULTS = {
  colors: Object.fromEntries(GROUPS.map((g) => [g.key, g.color])),
  hl: Object.fromEntries(GROUPS.map((g) => [g.key, true])),
  vis: Object.fromEntries(GROUPS.map((g) => [g.key, true])),
  showH: true, showOH: true, labels: true, ringFill: false, hlOpen: true,
  style: "bs", el: { ...EL_DEFAULT }, autoRotate: false, speed: 1,
  view: "3d", holo: false, holoOpacity: 32,
  holoParts: { C: true, OH: true, H: true, ficak: true, kamu: true },
};
const SH_DEFAULTS = {
  fav: [], favFirst: false, xset: null, xFirst: false, score: { ok: 0, total: 0 },
  introHidden: false, codes: [], dev: false, teach: false,
  // nyomda: fekete-fehér, teli/üreges, mindig fekete körvonal, feliratok, szerep a feliratban, háttér
  print: { bw: false, fill: "filled", blackOutline: false, labels: "carbons", roles: false, bg: "white", crop: false },
  // analizáló: karikás kijelölés (elsőre a csillagozottak), beállítások, pontszám
  oset: null, oFirst: false,
  ana: { view: "3d", form: "mix", source: "o", h: "label", oh: "label", askBond: true },
  anaScore: { ok: 0, total: 0, pts: 0, max: 0 },
  quiz: {
    view: "3d", source: "x", count: 4, perRow: 0, formula: true,
    // a molekula mellett ezeket is meg kell adni (ahol értelmezhető), és lehet-e animálni
    askCfg: false, askRing: false, askAn: false, anim: true,
  },
  // a panelek szélessége (null: alapméret), elrejtése és a nagy nézet
  layout: { lw: null, rw: null, hideL: false, hideR: false, focus: false },
  // hibakereső: másodperc, csoportok, nézet (3d/paper/both), visszaállítás (step/end), hologram beállításai
  dbg: { sec: 1, groups: { mono: true, di: false, poly: false }, views: "both", restore: "step", holo: true },
};
const HOLO_PARTS = [
  { key: "C", name: "C-váz" },
  { key: "OH", name: "OH-csoportok" },
  { key: "H", name: "H-atomok" },
  { key: "ficak", name: "Ficak" },
  { key: "kamu", name: "Kamuficak" },
];
const clone = (o) => JSON.parse(JSON.stringify(o));
function mergeInto(base, raw) {
  if (!raw || typeof raw !== "object") return base;
  for (const k of Object.keys(base)) {
    if (!(k in raw)) continue;
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) Object.assign(base[k], raw[k]);
    else base[k] = raw[k];
  }
  return base;
}
const { SV, SQ0, SP0, SH } = (() => {
  const SV = clone(DEFAULTS), SH = clone(SH_DEFAULTS);
  let SQ0 = null, SP0 = null;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (raw) {
      mergeInto(SV, raw.v);
      mergeInto(SH, raw.sh);
      if (raw.q) SQ0 = mergeInto(clone(DEFAULTS), raw.q);
      if (raw.pr) SP0 = mergeInto(clone(DEFAULTS), raw.pr);
    } else {
      // korábbi változat beállításainak átvétele
      const old = JSON.parse(localStorage.getItem("szenhidrat3d.v1") || "null");
      if (old) {
        mergeInto(SV, old);
        if (Array.isArray(old.fav)) SH.fav = old.fav;
        SH.favFirst = !!old.favFirst;
        if (old.quiz && typeof old.quiz.ok === "number") SH.score = old.quiz;
      }
    }
  } catch { /* nincs tárolás */ }
  return { SV, SQ0, SP0, SH };
})();
let SQ = SQ0; // a tippelő megjelenítési beállításai (az első belépéskor jön létre)
let SPR = SP0; // a nyomda megjelenítési beállításai (az első belépéskor a nézegetőéből)
/** Tanár módban (és fejlesztői módban) a jó válaszok narancssárgán látszanak, és elérhető a Nyomda. */
const showAnswers = () => !!(SH.dev || SH.teach);
const canPrint = () => !!(SH.dev || SH.teach);
let S = SV; // az éppen érvényes megjelenítési beállítások
const TOGGLES = ["showH", "showOH", "labels", "ringFill", "hlOpen", "autoRotate"];
const TOGGLE_ID = { labels: "showLabels" };
// a hibakereső futásának állapota (futás közben az átkapcsolások nem íródnak a tárolóba)
const DBG = { running: false, stop: false, i: 0, total: 0, issues: [], slow: null, saved: null, cur: null, done: null };
const save = () => {
  if (DBG.running) return;
  try { localStorage.setItem(STORE, JSON.stringify({ v: SV, q: SQ, pr: SPR, sh: SH })); } catch { /* nincs tárolás */ }
};

// ---------------------------------------------------------------------------
//  Állapot
// ---------------------------------------------------------------------------
const st = { rec: null, di: false, poly: false, cfg: "D", vkey: null, tl: "closure", t: 1, playing: false };
let models = null; // { m3, mP }
let model = null; // a fő (látható) modell
let holoModel; // a hologramként rávetített másik modell (undefined: még nem készült el)

const f64 = (a, mirror) => {
  const X = Float64Array.from(a);
  if (mirror) for (let i = 1; i < X.length; i += 3) X[i] = -X[i];
  return X;
};

function groupOf(N, g) {
  const out = new Array(N).fill(null);
  for (const key of PRIORITY) for (const i of g[key] || []) if (i < N) out[i] = key;
  return out;
}

/** A nyílt láncú forma neve a megadott konfigurációval (pl. D-glükóz). */
function openName(r, cfg) {
  if (r.id === "nacetilglukozamin") return `N-acetil-${cfg}-glükózamin`;
  if (r.id === "dezoxiriboz") return `2-dezoxi-${cfg}-ribóz`;
  if (!r.cfg) return r.name.toLowerCase();
  return `${cfg}-${r.name.toLowerCase()}`;
}
const lowerName = (r) => openName(r, st.cfg);
const unitName = (id) => (id === "nacetilglukozamin" ? "N-acetilglükózamin" : MONO.get(id).name.toLowerCase());

function carbonsOf(r) {
  const c = [];
  r.lab.forEach((l, i) => { const mm = /^C(\d+)$/.exec(l); if (mm && r.bb[i]) c[+mm[1] - 1] = i; });
  return c.filter((x) => x !== undefined);
}
function tryPaper(fn) {
  try { return fn(); } catch (e) { console.warn("A papírmodell nem készült el:", e); return null; }
}

/** A modellhez tartozó, megjelenítéshez szükséges segédadatok. */
function finishModel(m, meta) {
  Object.assign(m, meta);
  m.groupOf = groupOf(m.N, m.groups);
  m.ohSet = new Set();
  for (const [o, h] of m.ohs || []) { m.ohSet.add(o); m.ohSet.add(h); }
  m.present = new Set(GROUPS.map((g) => g.key).filter((k) => (m.groups[k] || []).length));
  // a hologram „OH-csoportok” kapcsolója alá tartozó atomok
  m.hydroxyl = new Set(m.ohSet);
  for (const i of m.groups.glyc || []) m.hydroxyl.add(i);
  if (m.kind === "cond") for (let i = m.N - 3; i < m.N; i++) m.hydroxyl.add(i);
  m.heavy = [...Array(m.N).keys()].filter((i) => m.el[i] !== "H");
  return m;
}

/**
 * A kiválasztott molekulából és formából felépíti a két megjelenítendő
 * modellt: a valódi térbelit (m3) és a tankönyvi papírmodellt (mP).
 * A papírmodell csak akkor készül el, amikor először szükség van rá
 * (2D nézet vagy hologram), mert a nagy molekuláknál ez a drágább.
 */
function buildModels() {
  const r = st.rec;
  let m3, paper, meta;
  if (st.poly) {
    const X = Float64Array.from(r.x);
    m3 = makeGrowth({ X, bonds: r.b, resi: r.resi, order: r.order, dirs: approachDirs(X, r.residues, r.bridges) });
    meta = { el: r.el, lab: r.lab, bb: r.bb, groups: r.g, ohs: r.ohs, kind: "poly",
      rings: r.residues.map((x) => ({ idx: x.ring })) };
    paper = () => {
      const XP = polyLayout({ X3: X, el: r.el, bonds: r.b, resi: r.resi, residues: r.residues, bridges: r.bridges,
        root: r.root, order: r.order });
      return makeGrowth({ X: XP, bonds: r.b, resi: r.resi, order: r.order, dirs: approachDirs(XP, r.residues, r.bridges) });
    };
  } else if (!st.di) {
    const mirror = st.cfg === "L";
    const v = r.v.find((x) => x.key === st.vkey);
    const Xo = f64(r.open.x, mirror);
    const carbons = carbonsOf(r);
    if (!v) {
      m3 = makeStatic(Xo, r.open.b);
      meta = { el: r.el, lab: r.lab, bb: r.bb, groups: {}, ohs: r.ohs0, rings: [], kind: "static" };
      paper = () => makePaperFischer({ el: r.el, bo: r.open.b, X3o: Xo, carbons });
    } else {
      const Xr = f64(v.x, mirror);
      m3 = makeClosure({ el: r.el, Xo, Xr, bo: r.open.b, br: v.b, root: v.root, tH: v.tH, tHo: v.tHo, tHr: v.tHr, aC: v.aC, ringForm: v.ringIdx });
      meta = { el: r.el, lab: r.lab, bb: r.bb, groups: v.g, ohs: v.ohs, kind: "closure", v,
        rings: [{ idx: v.ringIdx, forming: true }] };
      paper = () => makePaperClosure({ el: r.el, bo: r.open.b, br: v.b, X3o: Xo, X3r: Xr, ring: v.ringIdx,
        ringType: v.ring, carbons, tH: v.tH, tHo: v.tHo });
    }
  } else {
    const v = r.v.find((x) => x.key === st.vkey);
    const N = v.N, c = v.cond;
    const units = { ringA: v.ringA, ringB: v.ringB, side: c.side, newBond: c.newBond };
    if (st.tl === "cond") {
      m3 = makeCondensation({ free: Float64Array.from(c.free), fin: Float64Array.from(v.x), u: c.u, side: c.side,
        gMid: Float64Array.from(c.gMid), gEnd: Float64Array.from(c.gEnd), newBond: c.newBond, gBonds: c.gBonds, N, bonds: v.b });
      const g = { ...v.g, glyc: [...v.g.glyc, N, N + 1] };
      meta = { el: r.el, lab: r.lab, bb: r.bb, groups: g, ohs: v.ohs, kind: "cond", v,
        rings: [{ idx: v.ringA }, { idx: v.ringB }] };
      paper = () => {
        const ci = paperCondensationInput({ el: r.el, b: v.b, X3r: Float64Array.from(v.x), X3free: Float64Array.from(c.free),
          gBonds: c.gBonds, ...units });
        return makeCondensation({ ...ci, side: c.side, newBond: c.newBond, gBonds: c.gBonds, N, bonds: v.b });
      };
    } else if (v.open) {
      m3 = makeClosure({ el: r.el, Xo: Float64Array.from(v.open.x), Xr: Float64Array.from(v.x), bo: v.open.b, br: v.b,
        root: v.root, tH: v.tH, tHo: v.tHo, tHr: v.tHr, aC: v.aC, ringForm: v.ringB });
      meta = { el: r.el.slice(0, N), lab: r.lab.slice(0, N), bb: r.bb.slice(0, N), groups: v.g, ohs: v.ohs,
        kind: "closure", v, rings: [{ idx: v.ringA }, { idx: v.ringB, forming: true }] };
      paper = () => makePaperClosureDi({ el: r.el.slice(0, N), lab: r.lab, bb: r.bb, bo: v.open.b, br: v.b,
        X3o: Float64Array.from(v.open.x), X3r: Float64Array.from(v.x), tH: v.tH, tHo: v.tHo, ...units });
    } else {
      m3 = makeStatic(Float64Array.from(v.x), v.b);
      meta = { el: r.el.slice(0, N), lab: r.lab.slice(0, N), bb: r.bb.slice(0, N), groups: v.g, ohs: v.ohs,
        kind: "static", v, rings: [{ idx: v.ringA }, { idx: v.ringB }] };
      paper = () => makePaperDiStatic({ el: r.el, br: v.b, X3r: Float64Array.from(v.x), ...units });
    }
  }
  finishModel(m3, meta);
  let mP; // undefined: még nem készült el; null: nem sikerült
  return {
    m3,
    get mP() {
      if (mP === undefined) {
        mP = tryPaper(paper);
        if (mP) { mP.paper = true; finishModel(mP, meta); }
      }
      return mP;
    },
    /** elérhető-e a papírmodell (amíg nem próbáltuk, feltételezzük, hogy igen) */
    get paperOk() { return mP !== null; },
  };
}

// A legutóbb használt modellek gyorsítótára: ugyanarra a molekulára és formára
// visszaváltva (pl. 3D ↔ 2D, tippelő, hibakereső) nem kell újraszámolni.
const modelCache = new Map();
function getModels() {
  const key = `${st.rec.id}|${st.cfg}|${st.vkey}|${st.tl}`;
  let e = modelCache.get(key);
  if (e) modelCache.delete(key);
  else e = buildModels();
  modelCache.set(key, e);
  while (modelCache.size > 24) modelCache.delete(modelCache.keys().next().value);
  return e;
}

// ---------------------------------------------------------------------------
//  Three.js jelenet
// ---------------------------------------------------------------------------
const canvas = $("#canvas");
const viewport = $("#viewport");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
scene.add(camera);
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(4, 6, 8);
camera.add(key);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4458, 0.35));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.rotateSpeed = 0.85;
controls.autoRotateSpeed = 1.2;
const root = new THREE.Group();
scene.add(root);

const UP = new THREE.Vector3(0, 1, 0);
// A gömbök és hengerek felbontása a molekula méretétől függ: egy 400 atomos
// poliszacharid apró gömbjein a kevesebb háromszög nem látszik, de sokat gyorsít.
const GEO = [];
function geometryFor(n) {
  const lod = n > 220 ? 2 : n > 70 ? 1 : 0;
  if (!GEO[lod]) {
    GEO[lod] = {
      lod,
      sphere: new THREE.SphereGeometry(1, [40, 28, 20][lod], [28, 20, 14][lod]),
      cyl: new THREE.CylinderGeometry(1, 1, 1, [22, 16, 12][lod], 1, false),
    };
  }
  return GEO[lod];
}

/**
 * Anyag a példányosított rajzoláshoz: minden példánynak (atomnak, kötésfélnek)
 * saját színe (instanceColor) és átlátszósága (instanceAlpha) van. A hologram
 * a saját színében enyhén világít is.
 */
function instMaterial(holo, transparent, depthWrite) {
  const m = new THREE.MeshStandardMaterial(holo
    ? { roughness: 0.25, metalness: 0.0, envMapIntensity: 1.2 }
    : { roughness: 0.34, metalness: 0.02, envMapIntensity: 0.9 });
  m.transparent = transparent;
  m.depthWrite = depthWrite;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float instanceAlpha;\nvarying float vInstAlpha;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvInstAlpha = instanceAlpha;");
    let fs = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vInstAlpha;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n\tdiffuseColor.a *= vInstAlpha;");
    if (holo) {
      fs = fs.replace("#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.38;");
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => (holo ? "szh-inst-holo" : "szh-inst");
  return m;
}

/** Egy példányosított háló: azonos alakú és anyagú elemek (pl. az átlátszatlan gömbök). */
class Batch {
  constructor(geo, mat, cap, order) {
    const g = geo.clone(); // saját példány, így a felszabadítása nem érinti a többit
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("instanceAlpha", this.alphaAttr);
    const mesh = new THREE.InstancedMesh(g, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.count = 0;
    mesh.userData.batch = this;
    this.mesh = mesh;
    this.M = mesh.instanceMatrix.array;
    this.C = mesh.instanceColor.array;
    this.A = this.alphaAttr.array;
    this.ids = new Int32Array(cap); // példány → atom (ill. kötés) sorszáma
    this.atom = new Int32Array(cap); // kötésfélnél: melyik atomhoz tartozik
    this.side = new Int8Array(cap); // kötésfélnél: 0 = az eleje, 1 = a vége az atom (a vektoros képhez)
    this.n = 0;
  }
  /** Új példány; visszaadja a mátrixának helyét a tömbben. */
  push(id, cols, ci, alpha) {
    const k = this.n++;
    this.ids[k] = id;
    this.C[3 * k] = cols[ci];
    this.C[3 * k + 1] = cols[ci + 1];
    this.C[3 * k + 2] = cols[ci + 2];
    this.A[k] = alpha;
    return 16 * k;
  }
  flush() {
    const m = this.mesh;
    m.count = this.n;
    m.visible = this.n > 0;
    m.boundingSphere = null; // a sugárkövetés (egérmutató) újraszámolja
    if (!this.n) return;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
// ---- színek -----------------------------------------------------------------
const tmpC = new THREE.Color();
const tmpA = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);
const elColor = {};
function refreshElColors() {
  for (const e of ELS) elColor[e] = new THREE.Color(S.el[e] || EL_DEFAULT[e]);
}
refreshElColors();
const hlColor = {};
function refreshHl() {
  for (const g of GROUPS) hlColor[g.key] = new THREE.Color(S.colors[g.key]);
}
refreshHl();

const GREY = new THREE.Color("#a4abb6");
function atomColor(m, i, k, out) {
  // analizáló: a molekula szürke; a feliratozott atomok a választott elem és szerep színét kapják
  if (A.on && !A.done) {
    const L = anaLabelOf(i);
    if (!L) return out.copy(GREY);
    out.copy(elColor[L.el] || elColor.C);
    if (!L.role || L.role === "none" || !hlColor[L.role]) return out;
    tmpC.copy(hlColor[L.role]);
    if (L.el === "H") tmpC.lerp(WHITE, 0.45);
    else if (L.el === "C") tmpC.lerp(BLACK, 0.16);
    return out.copy(tmpC);
  }
  const el = m.el[i];
  out.copy(elColor[el] || elColor.C);
  const g = m.groupOf[i];
  if (!g || !S.hl[g] || k <= 0) return out;
  tmpC.copy(hlColor[g]);
  if (el === "H") tmpC.lerp(WHITE, 0.45);
  else if (el === "C") tmpC.lerp(BLACK, 0.16);
  return out.lerp(tmpC, k);
}

function atomVisible(m, i) {
  if (A.on) return anaState(i) !== "hidden"; // az analizáló saját H/OH-beállításai
  const el = m.el[i];
  if (el === "H" && !S.showH) return false;
  if (!S.showOH && m.ohSet.has(i)) return false;
  const g = m.groupOf[i];
  if (g && !S.vis[g]) return false;
  return true;
}

// A hologram saját kapcsolói: C-váz, OH-csoportok, H-atomok, ficak, kamuficak
function holoVisible(m, i) {
  const H = S.holoParts, el = m.el[i], g = m.groupOf[i];
  if (el === "H" && !H.H) return false;
  if (g === "ficak") return H.ficak;
  if (g === "kamu") return H.kamu;
  if (m.hydroxyl.has(i)) return H.OH;
  return H.C;
}

// ---- képkocka ---------------------------------------------------------------
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vD = new THREE.Vector3(), vO = new THREE.Vector3();
const vM = new THREE.Vector3(), vK = new THREE.Vector3();
const qT = new THREE.Quaternion(), mT = new THREE.Matrix4(), sT = new THREE.Vector3(), pT = new THREE.Vector3();

// a gyűrűsík színe a témából (csak témaváltáskor kell újra kiolvasni)
let ringColorCache = null;
const ringFillColor = () => (ringColorCache ??=
  getComputedStyle(document.documentElement).getPropertyValue("--ring-fill").trim() || "#3b82f6");
const themeChanged = () => { ringColorCache = null; changed(); };
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged); } catch { /* régi böngésző */ }
new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

/**
 * Egy modell megjelenítése (gömbök, kötések, gyűrűsík). A hologram is ilyen réteg.
 * Az atomok és a kötésfelek példányosított hálókban vannak: a fő modellnél egy
 * átlátszatlan, egy átlátszó és egy halvány (mélységírás nélküli) csoportban,
 * a hologramnál egyetlen átlátszó csoportban.
 */
class Layer {
  constructor(holo) {
    this.holo = holo;
    this.group = new THREE.Group();
    root.add(this.group);
    this.mats = holo
      ? [instMaterial(true, true, false)]
      : [instMaterial(false, false, true), instMaterial(false, true, true), instMaterial(false, true, false)];
    this.sph = []; this.cyl = []; this.rings = [];
    this.lod = -1; this.capA = 0; this.capB = 0;
    this.m = null; this.P = null; this.adj = null;
    this.vis = new Uint8Array(0); this.alpha = new Float32Array(0); this.cols = new Float32Array(0);
  }
  orderOf(k) { return this.holo ? 2 : k === 0 ? 0 : 1; }
  build(m) {
    for (const r of this.rings) { this.group.remove(r); r.geometry.dispose(); r.material.dispose(); }
    this.rings = [];
    this.m = m; this.P = null; this.adj = null;
    if (!m) {
      for (const b of [...this.sph, ...this.cyl]) { b.n = 0; b.flush(); }
      return;
    }
    const geo = geometryFor(m.N);
    const capA = m.N, capB = Math.max(1, 4 * m.bonds.length);
    // a hálók újrahasznosíthatók, ha elég nagyok és a felbontásuk is megfelelő
    if (geo.lod !== this.lod || capA > this.capA || capB > this.capB) {
      for (const b of [...this.sph, ...this.cyl]) { this.group.remove(b.mesh); b.dispose(); }
      this.sph = this.mats.map((mat, k) => new Batch(geo.sphere, mat, capA, this.orderOf(k)));
      this.cyl = this.mats.map((mat, k) => new Batch(geo.cyl, mat, capB, this.orderOf(k)));
      for (const b of [...this.sph, ...this.cyl]) this.group.add(b.mesh);
      this.lod = geo.lod; this.capA = capA; this.capB = capB;
    }
    this.vis = new Uint8Array(m.N);
    this.alpha = new Float32Array(m.N);
    this.cols = new Float32Array(3 * m.N);
    this.adj = Array.from({ length: m.N }, () => []);
    for (const b of m.bonds) { this.adj[b.i].push(b.j); this.adj[b.j].push(b.i); }
    if (this.holo) return;
    for (const ring of m.rings) {
      const n = ring.idx.length;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
      const index = [];
      for (let i = 0; i < n; i++) index.push(0, i + 1, ((i + 1) % n) + 1);
      g.setIndex(index);
      const mm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(g, mm);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push(mesh);
    }
  }
  setVisible(on) { this.group.visible = on; }
  /** A példány csoportja az átlátszóság szerint (a hologramnál mindig ugyanaz). */
  pick(list, a) { return this.holo || a >= 0.995 ? list[0] : a > 0.6 ? list[1] : list[2]; }
  /** Egy kötésfél (henger) a-tól b-ig, r sugárral. */
  cylinder(id, ci, ax, ay, az, bx, by, bz, r, alpha, side) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6 || alpha < 0.01 || r <= 0) return;
    const b = this.pick(this.cyl, alpha);
    const o = b.push(id, this.cols, ci, alpha);
    b.atom[o / 16] = ci / 3;
    b.side[o / 16] = side;
    vD.set(dx / L, dy / L, dz / L);
    qT.setFromUnitVectors(UP, vD);
    pT.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    sT.set(r, L, r);
    mT.compose(pT, qT, sT).toArray(b.M, o);
  }
  /** P: koordináták, visFn: láthatóság atomonként, opMul: átlátszóság-szorzó */
  update(P, t, visFn, opMul = 1) {
    const m = this.m;
    if (!m) return;
    this.P = P;
    const R = RADII[S.style];
    const bondStart = m.paper ? PAPER_T.bond[0] : TIMING.bond[0];
    const k = m.kind === "closure" && !S.hlOpen ? smooth(bondStart, 1, t) : 1;
    const { vis, alpha, cols } = this;
    for (const b of this.sph) b.n = 0;
    for (const b of this.cyl) b.n = 0;
    for (let i = 0; i < m.N; i++) {
      vis[i] = visFn(m, i) ? 1 : 0;
      alpha[i] = m.atomAlpha(t, i);
      atomColor(m, i, k, tmpA);
      cols[3 * i] = tmpA.r; cols[3 * i + 1] = tmpA.g; cols[3 * i + 2] = tmpA.b;
      if (!vis[i] || !(alpha[i] > 0.01)) continue;
      const a = alpha[i] * opMul;
      const b = this.pick(this.sph, a);
      const o = b.push(i, cols, 3 * i, a);
      const s = R[m.el[i]] || R.C, E = b.M;
      E[o] = s; E[o + 1] = 0; E[o + 2] = 0; E[o + 3] = 0;
      E[o + 4] = 0; E[o + 5] = s; E[o + 6] = 0; E[o + 7] = 0;
      E[o + 8] = 0; E[o + 9] = 0; E[o + 10] = s; E[o + 11] = 0;
      E[o + 12] = P[3 * i]; E[o + 13] = P[3 * i + 1]; E[o + 14] = P[3 * i + 2]; E[o + 15] = 1;
    }
    if (S.style !== "sf") {
      for (let n = 0; n < m.bonds.length; n++) {
        const b = m.bonds[n];
        const a0 = b.alpha(t) * Math.min(alpha[b.i], alpha[b.j]) * opMul;
        if (!vis[b.i] || !vis[b.j] || !(a0 >= 0.01)) continue;
        vA.set(P[3 * b.i], P[3 * b.i + 1], P[3 * b.i + 2]);
        vB.set(P[3 * b.j], P[3 * b.j + 1], P[3 * b.j + 2]);
        vM.addVectors(vA, vB).multiplyScalar(0.5);
        const s2 = b.second(t);
        const ci = 3 * b.i, cj = 3 * b.j;
        if (!(s2 > 0.001)) {
          this.cylinder(n, ci, vA.x, vA.y, vA.z, vM.x, vM.y, vM.z, R.bond, a0, 0);
          this.cylinder(n, cj, vM.x, vM.y, vM.z, vB.x, vB.y, vB.z, R.bond, a0, 1);
          continue;
        }
        // kettős kötés: két párhuzamos henger, a síkjuk egy szomszéd atom felé áll
        const nb = this.adj[b.i].find((x) => x !== b.j) ?? this.adj[b.j].find((x) => x !== b.i);
        vD.subVectors(vB, vA).normalize();
        if (nb !== undefined) {
          vK.set(P[3 * nb], P[3 * nb + 1], P[3 * nb + 2]).sub(vA);
          vO.copy(vK).addScaledVector(vD, -vK.dot(vD));
        } else vO.set(0, 0, 1).cross(vD);
        if (vO.lengthSq() < 1e-8) vO.set(1, 0, 0).cross(vD);
        vO.normalize();
        const off = R.off * s2, rad = R.bond + (R.dbl - R.bond) * s2;
        for (const [sign, am] of [[1, 1], [-1, s2]]) {
          const ox = vO.x * sign * off, oy = vO.y * sign * off, oz = vO.z * sign * off;
          const mx = vM.x + ox, my = vM.y + oy, mz = vM.z + oz;
          this.cylinder(n, ci, vA.x + ox, vA.y + oy, vA.z + oz, mx, my, mz, rad, a0 * am, 0);
          this.cylinder(n, cj, mx, my, mz, vB.x + ox, vB.y + oy, vB.z + oz, rad, a0 * am, 1);
        }
      }
    }
    for (const b of this.sph) b.flush();
    for (const b of this.cyl) b.flush();
    // gyűrűsík
    m.rings.forEach((ring, n) => {
      const mesh = this.rings[n];
      if (!mesh) return;
      let a = 1;
      if (ring.forming && m.kind === "closure") a = smooth(0.7, 0.95, t);
      mesh.visible = S.ringFill && !anaMasked() && a > 0.01;
      if (!mesh.visible) return;
      const pos = mesh.geometry.attributes.position;
      let cx = 0, cy = 0, cz = 0;
      ring.idx.forEach((i, j) => {
        pos.setXYZ(j + 1, P[3 * i], P[3 * i + 1], P[3 * i + 2]);
        cx += P[3 * i]; cy += P[3 * i + 1]; cz += P[3 * i + 2];
      });
      const L = ring.idx.length;
      pos.setXYZ(0, cx / L, cy / L, cz / L);
      pos.needsUpdate = true;
      mesh.material.color.set(ringFillColor());
      mesh.material.opacity = 0.17 * a;
    });
  }
  /** Az egérmutató alatti atom sorszáma (vagy null). */
  atomAt(raycaster) {
    const meshes = this.sph.map((b) => b.mesh).filter((x) => x.count > 0);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit && hit.instanceId !== undefined ? hit.object.userData.batch.ids[hit.instanceId] : null;
  }
}
const mainLayer = new Layer(false);
const holoLayer = new Layer(true);
let P = null; // a fő modell aktuális koordinátái
let HP = null; // a hologram koordinátái (a fő modellre illesztve)
let HX = null; // a hologram saját koordinátái (illesztés előtt)

/** A hologram modellje: csak bekapcsoláskor készül el (a papírmodell drága lehet). */
function ensureHolo() {
  if (holoModel === undefined) {
    holoModel = model.paper ? models.m3 : models.mP;
    holoLayer.build(holoModel);
    HP = HX = null;
  }
  return holoModel;
}

function renderFrame() {
  const t = st.t;
  P = model.frame(t, P && P.length === model.N * 3 ? P : undefined);
  mainLayer.update(P, t, atomVisible);
  const holoOn = !!(S.holo && !A.on && ensureHolo() && holoModel.N === model.N);
  holoLayer.setVisible(holoOn);
  if (holoOn) {
    HX = holoModel.frame(t, HX && HX.length === holoModel.N * 3 ? HX : undefined);
    HP = alignOnto(HX, P, model.heavy, HP && HP.length === HX.length ? HP : undefined);
    holoLayer.update(HP, t, holoVisible, S.holoOpacity / 100);
  }
}

function buildLabels() {
  $("#labels").innerHTML = "";
  labelEls = [];
  const m = model;
  if (A.on) {
    // analizáló: minden atomnak lehet felirata (a felhasználóé, a megadott, ill. kiértékelés után a helyes)
    for (let i = 0; i < m.N; i++) {
      const el = document.createElement("span");
      el.className = "lbl ana";
      el.hidden = true;
      $("#labels").appendChild(el);
      labelEls.push({ i, el, ana: true, has: false });
    }
    refreshAnaLabels();
    return;
  }
  if (st.poly) {
    // poliszacharidnál csak a kötéseket jelöljük (a sok C-számozás áttekinthetetlen lenne)
    // a gyakori kötéstípusból csak egyet, a ritkábbakat (pl. elágazások) mindenhol
    const cnt = {}, seen = {};
    for (const b of st.rec.bridges) cnt[b.link] = (cnt[b.link] || 0) + 1;
    const byOrder = [...st.rec.bridges].sort((a, b) => st.rec.order.indexOf(a.child) - st.rec.order.indexOf(b.child));
    for (const b of byOrder) {
      seen[b.link] = (seen[b.link] || 0) + 1;
      if (cnt[b.link] > 3 && seen[b.link] > 1) continue;
      const el = document.createElement("span");
      el.className = "lbl link";
      el.textContent = b.link;
      $("#labels").appendChild(el);
      labelEls.push({ i: b.o, el, link: true, gate: b.aC });
    }
    return;
  }
  if (st.di && (m.groups.bridge || []).length) {
    const el = document.createElement("span");
    el.className = "lbl link";
    el.textContent = st.rec.link;
    $("#labels").appendChild(el);
    labelEls.push({ i: m.groups.bridge[0], el, link: true });
  }
  const ringO = new Set(m.groups.ringO || []);
  const box = $("#labels");
  for (let i = 0; i < m.N; i++) {
    if (!(m.bb[i] || ringO.has(i))) continue;
    const el = document.createElement("span");
    el.className = "lbl" + (m.el[i] === "O" ? " o" : "");
    el.textContent = m.lab[i];
    box.appendChild(el);
    labelEls.push({ i, el });
  }
}
let labelEls = [];

function updateLabels() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  const show = S.labels;
  for (const { i, el, link, gate, ana, has } of labelEls) {
    const hideLink = link && (quizHidden() || (gate !== undefined ? mainLayer.alpha[gate] < 0.6 : st.t < 0.6));
    const on = ana ? has : show && !hideLink;
    if (!on || !mainLayer.vis[i] || mainLayer.alpha[i] < 0.3) { el.hidden = true; continue; }
    vA.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).project(camera);
    if (vA.z > 1) { el.hidden = true; continue; }
    el.hidden = false;
    el.style.transform = `translate(${((vA.x + 1) / 2) * w + 9}px, ${((1 - vA.y) / 2) * h - 9}px) translate(-50%, -50%)`;
  }
}

// ---- kamera -----------------------------------------------------------------
function fitCamera() {
  // A kamera úgy áll be, hogy a folyamat minden fázisa (nyitott, félúton,
  // végállapot) beleférjen a képbe – vízszintesen és függőlegesen is.
  const aspect = Math.max(0.3, viewport.clientWidth / Math.max(1, viewport.clientHeight));
  const tv = Math.tan((camera.fov * Math.PI) / 360), th = tv * aspect;
  const pad = S.style === "sf" ? 1.7 : 0.75;
  let d = 0;
  for (const t of anaMasked() ? [st.t] : [0, 0.35, 0.65, 1]) {
    const X = model.frame(t);
    for (let i = 0; i < X.length; i += 3) {
      const x = Math.abs(X[i]) + pad, y = Math.abs(X[i + 1]) + pad, z = X[i + 2];
      d = Math.max(d, x / th + z, y / tv + z);
    }
  }
  // a papírmodellt szemből nézzük, mint egy kinyomtatott oldalt
  const dir = model.paper ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0.36, 1).normalize();
  camera.position.copy(dir.multiplyScalar(d * 1.04));
  controls.target.set(0, 0, 0);
  camera.near = 0.1;
  camera.far = d * 6;
  camera.updateProjectionMatrix();
  controls.update();
}
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  // nagy felbontású (pl. 4K-s digitális tábla) kijelzőn a képpontok számát korlátozzuk
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pr = Math.max(1, Math.min(dpr, Math.sqrt(4.5e6 / Math.max(1, w * h))));
  if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  needRender = true;
}
new ResizeObserver(resize).observe(viewport);

// ---------------------------------------------------------------------------
//  Kezelőfelület
// ---------------------------------------------------------------------------
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const STAR_SVG = `<svg class="st" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"/></svg>`;
const X_SVG = `<svg class="xm" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19"/></svg>`;
const isFav = (id) => SH.fav.includes(id);
const isX = (id) => (SH.xset || []).includes(id);
const O_SVG = `<svg class="om" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/></svg>`;
const isO = (id) => (SH.oset || []).includes(id);
/** Az analizálóban a mono- és diszacharidok szerepelnek (gyűrűs és nyílt formában). */
const anaEligible = (id) => MONO.has(id) || DI.has(id);
/** Milyen formában elemezhető a molekula a beállítás szerint: gyűrűs ("ring") és/vagy nyílt ("open"). */
function anaForms(id) {
  const r = recOf(id), f = [];
  if (DI.has(id) || r.v.length) f.push("ring");
  if (MONO.has(id) || r.reducing) f.push("open"); // a nem redukáló diszacharidnak nincs nyílt formája
  const want = SH.ana.form || "mix";
  return want === "mix" ? f : f.filter((x) => x === want);
}
const ALL_IDS = [...DATA.monos.map((m) => m.id), ...DATA.dis.map((d) => d.id), ...POLYS.map((p) => p.id)];
const recOf = (id) => MONO.get(id) || DI.get(id) || POLY.get(id);
const kindOf = (id) => (MONO.has(id) ? "mono" : DI.has(id) ? "di" : "poly");
// Diszacharidok: az 1. egység szerint, egyezés esetén a 2. szerint (mint a vezeték- és utónév)
const linkPos = (d) => +((d.link.match(/[→↔](\d)/) || [0, 9])[1]);
const DIS_SORTED = [...DATA.dis].sort((a, b) =>
  MONO_IDX.get(a.A) - MONO_IDX.get(b.A) || MONO_IDX.get(a.B) - MONO_IDX.get(b.B) ||
  linkPos(a) - linkPos(b) || a.link.localeCompare(b.link));

function itemButton(id, name, meta, metaMono, search) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "item";
  b.dataset.id = id;
  b.dataset.search = norm(search);
  b.innerHTML = `<span class="nm"></span><span class="meta${metaMono ? " mono" : ""}"></span>`;
  b.querySelector(".nm").textContent = name;
  b.querySelector(".meta").textContent = meta;
  const s = document.createElement("button");
  s.type = "button";
  s.className = "star";
  s.dataset.star = id;
  s.setAttribute("aria-pressed", String(isFav(id)));
  s.setAttribute("aria-label", `${name} csillagozása`);
  s.title = "Csillagozás";
  s.innerHTML = STAR_SVG;
  // a tippelőben a csillag helyett X-szel jelöljük ki, miből kérdezzen
  const x = document.createElement("button");
  x.type = "button";
  x.className = "xbtn";
  x.dataset.x = id;
  x.setAttribute("aria-pressed", String(isX(id)));
  x.setAttribute("aria-label", `${name} kijelölése a tippelőhöz`);
  x.title = "Kijelölés a tippelőhöz";
  x.innerHTML = X_SVG;
  // az analizálóban karikával jelöljük ki, miből kérdezzen
  const o = document.createElement("button");
  o.type = "button";
  o.className = "obtn";
  o.dataset.o = id;
  const ok = anaEligible(id);
  o.disabled = !ok;
  o.setAttribute("aria-pressed", String(ok && isO(id)));
  o.setAttribute("aria-label", `${name} bekarikázása az analizálóhoz`);
  o.title = ok ? "Bekarikázás az analizálóhoz" : "Az analizálóban csak mono- és diszacharidok vannak";
  o.innerHTML = O_SVG;
  li.append(b, s, x, o);
  return li;
}
const monoItem = (m) => itemButton(m.id, m.name, m.alt || m.formula, !m.alt, `${m.name} ${m.alt} ${m.id}`);
const polyItem = (p) => itemButton(p.id, p.name, p.links.join(", "), true, `${p.name} ${p.alt} ${p.id} ${p.repeat}`);
const diItem = (d) => itemButton(d.id, d.name, d.link, true, `${d.name} ${d.alt} ${d.id} ${unitName(d.A)} ${unitName(d.B)}`);
const chev = `<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;
function details(cls, title, extra, open, key) {
  const d = document.createElement("details");
  d.className = `grp ${cls}`;
  d.open = open;
  d.dataset.key = key;
  d.innerHTML = `<summary>${chev}<span></span>${extra || ""}</summary>`;
  d.querySelector("summary span").textContent = title;
  return d;
}
function subList(parent, title, items) {
  const h = document.createElement("div");
  h.className = "subhead";
  h.textContent = title;
  const ul = document.createElement("ul");
  ul.className = "items";
  for (const it of items) ul.appendChild(it);
  parent.append(h, ul);
}

function buildTree() {
  const nav = $("#tree");
  const openState = new Map($$("#tree details.grp").map((d) => [d.dataset.key, d.open]));
  nav.innerHTML = "";
  // Csillagozottak (a tippelőben: X-eltek, az analizálóban: bekarikázottak) előre, ha a kereső melletti gomb be van kapcsolva
  const marked = Q.on ? isX : A.on ? isO : isFav;
  if (Q.on ? SH.xFirst : A.on ? SH.oFirst : SH.favFirst) {
    const fm = DATA.monos.filter((m) => marked(m.id)), fd = DIS_SORTED.filter((d) => marked(d.id));
    const fp = POLYS.filter((p) => marked(p.id));
    const fav = details("lvl1 fav", Q.on ? "Kijelöltek (X)" : A.on ? "Bekarikázottak" : "Csillagozottak",
      `<span class="count">${fm.length + fd.length + fp.length}</span>`, true, Q.on ? "xfav" : A.on ? "ofav" : "fav");
    if (fm.length) subList(fav, "Monoszacharidok", fm.map(monoItem));
    if (fd.length) subList(fav, "Diszacharidok", fd.map(diItem));
    if (fp.length) subList(fav, "Poliszacharidok", fp.map(polyItem));
    if (!fm.length && !fd.length && !fp.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = Q.on
        ? "Még nincs kijelölt molekula. A nevek melletti X-szel jelölheted ki, miből kérdezzen."
        : A.on
          ? "Még nincs bekarikázott molekula. A nevek melletti karikával jelölheted ki, mit kérjen elemzésre."
          : "Még nincs csillagozott molekula. A nevek melletti csillaggal jelölheted meg őket.";
      fav.appendChild(p);
    }
    nav.appendChild(fav);
  }
  // Monoszacharidok: szénatomszám szerint növekvő sorrendben
  const mono = details("lvl1", "Monoszacharidok", `<span class="count">${DATA.monos.length}</span>`, true, "mono");
  for (const n of [3, 4, 5, 6, 7]) {
    const list = DATA.monos.filter((m) => m.n === n);
    if (!list.length) continue;
    const d2 = details("lvl2", `${CLS[n]} `, `<span class="cn">C${subNum(n)}</span>`, n === 6, `mono-${n}`);
    for (const sb of SUBS) {
      const ls = list.filter((m) => m.sub === sb);
      if (ls.length) subList(d2, SUB[sb], ls.map(monoItem));
    }
    mono.appendChild(d2);
  }
  nav.appendChild(mono);
  const top = details("lvl1", "Diszacharidok", `<span class="count">${DIS_SORTED.length}</span>`, true, "di");
  let curCls = null, curPair = null, d2 = null, items = [];
  const flush = () => { if (items.length) subList(d2, curPair, items); items = []; };
  for (const d of DIS_SORTED) {
    const nA = MONO.get(d.A).n, nB = MONO.get(d.B).n;
    const cls = `${CLS1[nA]} + ${CLS1[nB]}`;
    const pair = `${unitName(d.A)} + ${unitName(d.B)}`;
    if (cls !== curCls) {
      flush();
      curCls = cls;
      curPair = null;
      d2 = details("lvl2", cls, "", nA === 6 && nB === 6, `di-${cls}`);
      top.appendChild(d2);
    }
    if (pair !== curPair) { flush(); curPair = pair; }
    items.push(diItem(d));
  }
  flush();
  nav.appendChild(top);
  if (POLYS.length) {
    const pol = details("lvl1", "Poliszacharidok", `<span class="count">${POLYS.length}</span>`, true, "poly");
    for (const [g, title] of POLY_GROUPS) {
      const ls = POLYS.filter((p) => p.group === g);
      if (ls.length) subList(pol, title, ls.map(polyItem));
    }
    nav.appendChild(pol);
  }
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.id = "emptyMsg";
  empty.hidden = true;
  empty.textContent = "Nincs ilyen nevű molekula a listában.";
  nav.appendChild(empty);
  for (const d of $$("#tree details.grp")) if (openState.has(d.dataset.key)) d.open = openState.get(d.dataset.key);
  markCurrent();
  filterTree($("#search").value);
}

function markCurrent() {
  for (const b of $$(".item")) b.setAttribute("aria-current", String(!Q.on && !A.on && !!st.rec && b.dataset.id === st.rec.id));
}

function toggleFav(id) {
  const i = SH.fav.indexOf(id);
  if (i >= 0) SH.fav.splice(i, 1);
  else SH.fav.push(id);
  save();
  if (SH.favFirst) buildTree();
  else $$(`.star[data-star="${id}"]`).forEach((b) => b.setAttribute("aria-pressed", String(isFav(id))));
  renderQuiz();
}

function toggleX(id) {
  if (!SH.xset) SH.xset = [];
  const i = SH.xset.indexOf(id);
  if (i >= 0) SH.xset.splice(i, 1);
  else SH.xset.push(id);
  save();
  if (SH.xFirst) buildTree();
  else $$(`.xbtn[data-x="${id}"]`).forEach((b) => b.setAttribute("aria-pressed", String(isX(id))));
  syncQuizSettings();
  renderQuiz();
}
function toggleO(id) {
  if (!anaEligible(id)) return;
  if (!SH.oset) SH.oset = [];
  const i = SH.oset.indexOf(id);
  if (i >= 0) SH.oset.splice(i, 1);
  else SH.oset.push(id);
  save();
  if (SH.oFirst) buildTree();
  else $$(`.obtn[data-o="${id}"]`).forEach((b) => b.setAttribute("aria-pressed", String(isO(id))));
  syncAnaSettings();
}
function setOset(ids) {
  SH.oset = ids.filter(anaEligible);
  save();
  buildTree();
  syncAnaSettings();
}
function setXset(ids) {
  SH.xset = [...ids];
  save();
  buildTree();
  syncQuizSettings();
  renderQuiz();
}

function filterTree(q) {
  const nq = norm(q.trim());
  let any = false;
  for (const b of $$(".item")) {
    const ok = !nq || b.dataset.search.includes(nq);
    b.parentElement.hidden = !ok;
    any ||= ok;
  }
  for (const ul of $$(".items")) {
    const vis = [...ul.children].some((li) => !li.hidden);
    ul.hidden = !vis;
    ul.previousElementSibling.hidden = !vis;
  }
  for (const d of $$("details.grp")) {
    const vis = $$(".items", d).some((u) => !u.hidden);
    d.hidden = !vis && !(d.classList.contains("fav") && !nq);
    if (nq && vis) d.open = true;
  }
  $("#emptyMsg").hidden = any;
}

// ---- kiemelés-sorok ---------------------------------------------------------
const eyeSvg = `<svg class="on" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><svg class="off" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
function buildHlRows() {
  const box = $("#hlRows");
  for (const g of GROUPS) {
    const row = document.createElement("div");
    row.className = "hl-row";
    row.dataset.g = g.key;
    row.innerHTML = `
      <input type="checkbox" class="box" id="hl-${g.key}" aria-label="${g.name} színezése">
      <input type="color" id="col-${g.key}" aria-label="${g.name} színe">
      <label class="hl-text" for="hl-${g.key}"><span class="hl-name">${g.name}</span><span class="hl-hint">${g.hint}</span></label>
      <button type="button" class="eye" id="vis-${g.key}" aria-label="${g.name} láthatósága">${eyeSvg}</button>`;
    box.appendChild(row);
    const cb = row.querySelector(".box"), col = row.querySelector('input[type="color"]'), eye = row.querySelector(".eye");
    cb.addEventListener("change", () => { S.hl[g.key] = cb.checked; save(); changed(); });
    col.addEventListener("input", () => { S.colors[g.key] = col.value; refreshHl(); save(); changed(); });
    eye.addEventListener("click", () => { S.vis[g.key] = !S.vis[g.key]; save(); syncControls(); changed(); });
  }
}

function syncControls() {
  for (const g of GROUPS) {
    $(`#hl-${g.key}`).checked = !!S.hl[g.key];
    $(`#col-${g.key}`).value = S.colors[g.key];
    const eye = $(`#vis-${g.key}`);
    eye.setAttribute("aria-pressed", String(!!S.vis[g.key]));
    eye.title = S.vis[g.key] ? "Elrejtés" : "Megjelenítés";
  }
  for (const id of TOGGLES) $(`#${TOGGLE_ID[id] || id}`).checked = !!S[id];
  for (const e of ELS) $(`#el-${e}`).value = S.el[e] || EL_DEFAULT[e];
  $$("#segStyle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.style)));
  $("#speed").value = String(S.speed);
  controls.autoRotate = !!S.autoRotate;
  $("#favFirst").setAttribute("aria-pressed", String(!!(Q.on ? SH.xFirst : A.on ? SH.oFirst : SH.favFirst)));
  $("#favFirst").title = Q.on ? "Kijelöltek (X) előre" : A.on ? "Bekarikázottak előre" : "Csillagozottak előre";
  $("#holoOn").checked = !!S.holo;
  $("#holoQ").setAttribute("aria-pressed", String(!!S.holo));
  $("#holoOpacity").value = String(S.holoOpacity);
  for (const p of HOLO_PARTS) $(`#hp-${p.key}`).checked = !!S.holoParts[p.key];
  $("#h-holo").closest(".sec").classList.toggle("off", !S.holo);
}

function buildHoloParts() {
  const box = $("#holoParts");
  for (const p of HOLO_PARTS) {
    const l = document.createElement("label");
    l.className = "chk";
    l.innerHTML = `<input type="checkbox" id="hp-${p.key}"><span>${p.name}</span>`;
    box.appendChild(l);
    l.querySelector("input").addEventListener("change", (e) => {
      S.holoParts[p.key] = e.target.checked;
      if (e.target.checked && !S.holo) S.holo = true; // ha a részletet bekapcsolja, a hologram is látszódjon
      save(); syncControls(); changed();
    });
  }
}
function setView(v) {
  if (Q.on || A.on) return; // a tippelőben és az analizálóban a nézetet a saját beállításuk rögzíti
  if (v === "paper" && !models.mP) return;
  if (S.view === v) return;
  S.view = v;
  save();
  pickModels();
  fitCamera();
  updateStaticUI();
  changed();
}
function setHolo(on) {
  S.holo = on;
  save(); syncControls(); changed();
}

function bindControls() {
  for (const id of TOGGLES) {
    $(`#${TOGGLE_ID[id] || id}`).addEventListener("change", (e) => { S[id] = e.target.checked; save(); syncControls(); changed(); });
  }
  for (const e of ELS) {
    $(`#el-${e}`).addEventListener("input", (ev) => { S.el[e] = ev.target.value; refreshElColors(); save(); changed(); });
  }
  $("#segStyle").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const wasSf = S.style === "sf";
    S.style = b.dataset.v; save(); syncControls(); changed();
    if (wasSf !== (S.style === "sf")) fitCamera();
  });
  $("#resetColors").addEventListener("click", () => {
    S.colors = JSON.parse(JSON.stringify(DEFAULTS.colors));
    S.el = { ...EL_DEFAULT };
    refreshHl(); refreshElColors(); save(); syncControls(); changed();
  });
  $("#resetView").addEventListener("click", fitCamera);
  for (const id of ["#segView", "#segViewQ"]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b && !b.disabled) setView(b.dataset.v);
    });
  }
  $("#holoOn").addEventListener("change", (e) => setHolo(e.target.checked));
  $("#holoQ").addEventListener("click", () => setHolo(!S.holo));
  $("#holoOpacity").addEventListener("input", (e) => { S.holoOpacity = +e.target.value; save(); changed(); });
  $("#speed").addEventListener("change", (e) => { S.speed = +e.target.value; save(); });

  $("#segCfg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    st.cfg = b.dataset.v;
    rebuild(false);
  });
  $("#segRing").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const an = st.vkey ? st.vkey.split("-")[1] : "a";
    const want = `${b.dataset.v}-${an}`;
    const v = st.rec.v.find((x) => x.key === want) || st.rec.v.find((x) => x.ring === b.dataset.v);
    if (v) { st.vkey = v.key; rebuild(false); }
  });
  $("#segAn").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (st.di) st.vkey = b.dataset.v;
    else st.vkey = `${st.vkey.split("-")[0]}-${b.dataset.v}`;
    rebuild(false);
  });

  // idővonal
  $("#tlTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled || b.dataset.tl === st.tl || quizAnimLocked()) return;
    st.tl = b.dataset.tl;
    st.playing = false;
    st.t = 0;
    rebuild(true);
  });
  $("#btnPlay").addEventListener("click", togglePlay);
  $("#btnStart").addEventListener("click", () => { st.playing = false; st.t = 0; changed(); });
  $("#btnEnd").addEventListener("click", () => { st.playing = false; st.t = 1; changed(); });
  $("#scrub").addEventListener("input", (e) => { st.playing = false; st.t = +e.target.value / 1000; changed(); });
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.closest("input, select, textarea, button, a, .modal")) return;
    e.preventDefault();
    togglePlay();
  });

  // fiókok (keskeny kijelzőn)
  $("#openLeft").addEventListener("click", () => openDrawer("left"));
  $("#openRight").addEventListener("click", () => openDrawer("right"));
  $("#backdrop").addEventListener("click", closeDrawers);
  $("#search").addEventListener("input", (e) => filterTree(e.target.value));
  $("#tree").addEventListener("click", (e) => {
    const star = e.target.closest(".star");
    if (star) { toggleFav(star.dataset.star); return; }
    const xb = e.target.closest(".xbtn");
    if (xb) { toggleX(xb.dataset.x); return; }
    const ob = e.target.closest(".obtn");
    if (ob) { toggleO(ob.dataset.o); return; }
    const b = e.target.closest(".item");
    if (!b) return;
    if (Q.on) { toggleX(b.dataset.id); return; } // a tippelőben a lista a kérdések körét állítja
    if (A.on) { toggleO(b.dataset.id); return; } // az analizálóban is
    select(b.dataset.id);
    closeDrawers();
  });
  $("#favFirst").addEventListener("click", () => {
    if (Q.on) SH.xFirst = !SH.xFirst;
    else if (A.on) SH.oFirst = !SH.oFirst;
    else SH.favFirst = !SH.favFirst;
    save();
    syncControls();
    buildTree();
  });
  $("#segMode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setMode(b.dataset.v);
  });
  $("#qOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (b && !b.disabled) quizPick(b.dataset.id, b);
  });
  $("#qNext").addEventListener("click", quizNew);
}
function openDrawer(side) {
  $(`#${side}`).classList.add("open");
  $("#backdrop").classList.add("show");
}
function closeDrawers() {
  $("#left").classList.remove("open");
  $("#right").classList.remove("open");
  $("#backdrop").classList.remove("show");
}

// ---- elrendezés: elrejthető, átméretezhető panelek, nagy nézet ------------------------
// A panelek állapota az eszközön megmarad. Keskeny ablakban (≤ 1024 px) és nagy
// nézetben a panelek fiókként csúsznak be, a 3D-tér pedig kitölti a helyüket.
const LAYOUT = SH.layout;
const narrowMQ = window.matchMedia("(max-width: 1024px)");
const PANEL = {
  l: { el: "#left", w: "lw", hide: "hideL", def: [272, 240], name: "A molekulalista" },
  r: { el: "#right", w: "rw", hide: "hideR", def: [304, 280], name: "A beállítások panel" },
};
const MIN_PANEL = 200, COLLAPSE_AT = 130, MIN_STAGE = 380, MAX_PANEL = 640;
const defWidth = (s) => PANEL[s].def[window.innerWidth <= 1180 ? 1 : 0];
const docked = (s) => !narrowMQ.matches && !LAYOUT.focus && !LAYOUT[PANEL[s].hide];
function contentWidth() {
  const app = $(".app"), cs = getComputedStyle(app);
  return app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}
function applyLayout() {
  const app = $(".app");
  const dl = !docked("l"), dr = !docked("r");
  app.classList.toggle("dl", dl);
  app.classList.toggle("dr", dr);
  document.body.classList.toggle("narrow", narrowMQ.matches);
  document.body.classList.toggle("focus", !!LAYOUT.focus);
  // a középső rész mindig kapjon legalább MIN_STAGE szélességet
  let lw = LAYOUT.lw || defWidth("l"), rw = LAYOUT.rw || defWidth("r");
  const want = (dl ? 0 : lw) + (dr ? 0 : rw);
  const avail = contentWidth() - MIN_STAGE - (dl ? 0 : 12) - (dr ? 0 : 12);
  if (want > 0 && want > avail) {
    const k = Math.max(0, avail) / want;
    lw = Math.max(160, Math.floor(lw * k));
    rw = Math.max(160, Math.floor(rw * k));
  }
  app.style.setProperty("--lw", `${lw}px`);
  app.style.setProperty("--rw", `${rw}px`);
  for (const [s, w] of [["l", lw], ["r", rw]]) {
    const sp = $(`#split-${s}`);
    sp.setAttribute("aria-valuemin", String(MIN_PANEL));
    sp.setAttribute("aria-valuemax", String(MAX_PANEL));
    sp.setAttribute("aria-valuenow", String(w));
  }
  if (!dl) $("#left").classList.remove("open");
  if (!dr) $("#right").classList.remove("open");
  if (!$(".side.open")) $("#backdrop").classList.remove("show");
  $("#tglLeft").setAttribute("aria-pressed", String(!dl));
  $("#tglRight").setAttribute("aria-pressed", String(!dr));
  const f = $("#btnFocus");
  f.setAttribute("aria-pressed", String(!!LAYOUT.focus));
  f.setAttribute("aria-label", LAYOUT.focus ? "Kilépés a nagy nézetből" : "Nagy nézet");
  f.title = LAYOUT.focus
    ? "Kilépés a nagy nézetből"
    : "Nagy nézet: a felső sáv és a két oldalsó panel eltűnik (a panelek a gombokkal továbbra is elérhetők)";
}
function togglePanel(s) {
  if (narrowMQ.matches) { openDrawer(s === "l" ? "left" : "right"); return; }
  if (LAYOUT.focus) { LAYOUT.focus = false; LAYOUT[PANEL[s].hide] = false; }
  else LAYOUT[PANEL[s].hide] = !LAYOUT[PANEL[s].hide];
  save();
  applyLayout();
}
function setFocus(on) {
  LAYOUT.focus = on;
  closeDrawers();
  save();
  applyLayout();
}
/** Elválasztó: húzással a panel szélessége, nagyon keskenyre húzva elrejti. */
function bindSplitter(s) {
  const el = $(`#split-${s}`), P = PANEL[s];
  let raf = 0, lastX = 0, startW = null;
  const maxFor = () => {
    const other = s === "l" ? "r" : "l";
    const ow = docked(other) ? $(PANEL[other].el).offsetWidth + 12 : 0;
    return Math.min(MAX_PANEL, contentWidth() - ow - 12 - MIN_STAGE);
  };
  const apply = () => {
    raf = 0;
    const app = $(".app"), r = app.getBoundingClientRect(), cs = getComputedStyle(app);
    const x = lastX - r.left - parseFloat(cs.paddingLeft);
    const w = s === "l" ? x - 6 : contentWidth() - x - 6;
    if (w < COLLAPSE_AT) {
      // elrejtés; visszakapcsoláskor a húzás előtti szélességgel jön elő
      LAYOUT[P.hide] = true;
      LAYOUT[P.w] = startW;
    } else {
      LAYOUT[P.hide] = false;
      LAYOUT[P.w] = Math.round(Math.max(MIN_PANEL, Math.min(maxFor(), w)));
    }
    applyLayout();
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startW = LAYOUT[P.w];
    el.classList.add("drag");
    document.body.classList.add("resizing");
    const move = (ev) => { lastX = ev.clientX; if (!raf) raf = requestAnimationFrame(apply); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.classList.remove("drag");
      document.body.classList.remove("resizing");
      save();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
  el.addEventListener("dblclick", () => { LAYOUT[P.w] = null; LAYOUT[P.hide] = false; save(); applyLayout(); });
  el.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const cur = LAYOUT[P.w] || defWidth(s);
    const next = cur + (s === "l" ? dir : -dir) * (e.shiftKey ? 64 : 16);
    LAYOUT[P.w] = Math.round(Math.max(MIN_PANEL, Math.min(maxFor(), next)));
    save();
    applyLayout();
  });
}
function bindLayout() {
  bindSplitter("l");
  bindSplitter("r");
  $("#tglLeft").addEventListener("click", () => togglePanel("l"));
  $("#tglRight").addEventListener("click", () => togglePanel("r"));
  $("#btnFocus").addEventListener("click", () => setFocus(!LAYOUT.focus));
  narrowMQ.addEventListener?.("change", applyLayout);
  let rq = 0;
  window.addEventListener("resize", () => {
    if (!rq) rq = requestAnimationFrame(() => { rq = 0; applyLayout(); if (Q.on) layoutOptions(); });
  });
  // leírás ki/be (szűkös helyen alapból rejtett)
  $("#btnInfo").addEventListener("click", () => {
    const head = $(".stage-head"), open = !head.classList.contains("info-open");
    head.classList.toggle("info-open", open);
    $("#btnInfo").setAttribute("aria-expanded", String(open));
    const t = open ? "Leírás elrejtése" : "Leírás megjelenítése";
    $("#btnInfo").title = t;
    $("#btnInfo").setAttribute("aria-label", t);
  });
  // teljes képernyő (ha a böngésző engedi; pl. beágyazott nézetben nem mindig)
  const fb = $("#btnFull"), de = document.documentElement;
  if (document.fullscreenEnabled && de.requestFullscreen) {
    fb.hidden = false;
    fb.addEventListener("click", () => {
      const p = document.fullscreenElement ? document.exitFullscreen() : de.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    });
    document.addEventListener("fullscreenchange", () => {
      const on = !!document.fullscreenElement;
      fb.setAttribute("aria-pressed", String(on));
      fb.title = on ? "Kilépés a teljes képernyőből" : "Teljes képernyő";
      fb.setAttribute("aria-label", fb.title);
    });
  }
  applyLayout();
}

/** A tippelőben (ha úgy van beállítva) válasz előtt nincs animáció: csak a kész forma látszik. */
// (az analizálóban csak a gyűrűs forma látszik, ott nincs animáció)
const quizAnimLocked = () => (Q.on && !Q.answered && SH.quiz.anim === false) || anaMasked();
function hasTimeline() {
  return !!model && model.kind !== "static" && !quizAnimLocked();
}
function togglePlay() {
  if (!hasTimeline() || NY.on) return; // a nyomdában nincs animáció
  if (st.playing) { st.playing = false; changed(); return; }
  if (st.t >= 1) st.t = 0;
  st.playing = true;
  changed();
}

// ---- kiválasztás --------------------------------------------------------------
function load(id, opts = {}) {
  const rec = recOf(id);
  if (!rec) return;
  st.rec = rec;
  st.di = DI.has(id);
  st.poly = POLY.has(id);
  if (st.poly) {
    st.cfg = "D"; st.vkey = null; st.tl = "poly"; st.playing = false; st.t = 1;
    rebuild(true);
    markCurrent();
    return;
  }
  st.cfg = opts.cfg || rec.cfg || "D";
  st.vkey = opts.vkey ?? rec.defv ?? null;
  st.tl = "closure";
  st.playing = false;
  const closable = st.di ? rec.reducing : rec.v.length > 0;
  if (st.di && !rec.reducing) st.tl = "cond";
  st.t = closable || st.di ? 1 : 0;
  rebuild(true);
  markCurrent();
}
function select(id) {
  if (Q.on) { quizAnswer(id); return; }
  load(id);
  try { history.replaceState(null, "", `#${id}`); } catch { /* beágyazott nézet */ }
}

// ---- tippelő (gyakorlás) ----------------------------------------------------------
const Q = {
  on: false, id: null, opts: [], answered: false, picked: null, last: null, view: "3d", empty: false,
  truth: {}, // a kérdezett molekula valódi formája: { cfg, ring, an }
  pick: {}, // a válaszban megadott forma
  wrong: [], // a molekula jó, de ezek a részek nem
  ok: false,
};
// ---- analizáló (állapot; a működése lejjebb) ----
const A = {
  on: false, id: null, last: null, done: false, view: "3d",
  t: 1, // a feladat állapota: 1 = gyűrűs forma, 0 = nyílt lánc
  labels: new Map(), // atom → { el, num, prime, role }: a felhasználó feliratai
  ans: {}, // a felső részen megadott adatok (pl. cfg, ring, an, name, formula; diszacharidnál u1.*, u2.*, bond, red)
  truth: null, // a helyes válaszok: { atoms: [...], form: {...} }
  res: null, // a kiértékelés eredménye
};
// ---- nyomda (állapot; a működése lejjebb) ----
const NY = { on: false, picks: new Set(), pickKey: "", html: "" };
const currentMode = () => (Q.on ? "quiz" : A.on ? "ana" : NY.on ? "print" : "view");
/** Az analizálóban kiértékelés előtt: a modell szürke, a helyes válaszok rejtve. */
const anaMasked = () => A.on && !A.done;
/** Válasz előtt rejtve marad minden, ami elárulná a megoldást (tippelő és analizáló). */
const quizHidden = () => (Q.on && !Q.answered) || anaMasked();
const hideName = (s) => (quizHidden() ? "?" : s);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** A kérdések köre: az X-elt molekulák, vagy (ha úgy állítod) az összes. */
function quizPool() {
  if (SH.quiz.source === "all") return { ids: ALL_IDS, all: true };
  const ids = (SH.xset || []).filter((id) => recOf(id));
  // ha nincs legalább két kijelölt molekula, az összesből kérdez (így mindig elindul)
  if (ids.length < 2) return { ids: ALL_IDS, all: true, fallback: true };
  return { ids, all: false };
}
const optionCount = (pool) => Math.max(2, Math.min(SH.quiz.count || 4, pool.ids.length));

/**
 * A beállítások szerint mit kell még megadni ennél a molekulánál (ahol értelmezhető):
 * monoszacharidnál D/L (ha királis), gyűrűméret és anomer (ha van gyűrűs formája),
 * redukáló diszacharidnál a redukáló vég anomerje.
 */
function askFor(id) {
  const c = SH.quiz, r = recOf(id), k = kindOf(id);
  const a = { cfg: false, ring: false, an: false };
  if (k === "mono") {
    a.cfg = !!c.askCfg && !!r.cfg;
    a.ring = !!c.askRing && r.v.length > 0;
    a.an = !!c.askAn && r.v.length > 0;
  } else if (k === "di") {
    a.an = !!c.askAn && !!r.reducing;
  }
  return a;
}
const ASK_KEYS = ["cfg", "ring", "an"];
const ASK_NAME = { cfg: "a konfiguráció", ring: "a gyűrű", an: "az anomer" };
const askText = (k, v) => (k === "ring" ? (v === "p" ? "6 tagú" : "5 tagú") : k === "an" ? GREEK[v] : v);

/** Monoszacharid neve a megadott formában (ha nincs ilyen forma az adatokban, a meglévőből képezzük). */
function monoFormName(r, cfg, ring, an) {
  let v = r.v.find((x) => x.ring === ring && x.an === an);
  if (v) return v.name.replace("{cfg}", cfg);
  v = r.v.find((x) => x.an === an) || r.v[0];
  let nm = v.name.replace("{cfg}", cfg).replace(/[αβ]/, GREEK[an]);
  if (v.ring !== ring) nm = ring === "f" ? nm.replace("piran", "furan") : nm.replace("furan", "piran");
  return nm;
}
/**
 * A teljes név a válasz előnézetéhez: a meg nem kérdezett részek a látott
 * molekula formáját követik (minden lehetőségnél ugyanúgy, így nem árul el semmit).
 */
function fullNameOf(id, pick) {
  const r = recOf(id), k = kindOf(id), T = Q.truth;
  if (k === "poly") return r.name;
  if (k === "di") {
    const an = pick.an || T.an || r.defv;
    const v = r.v.find((x) => x.an === an) || r.v[0];
    return `${v.common} · ${v.name}`;
  }
  const cfg = pick.cfg || (r.cfg ? T.cfg || r.cfg : "D");
  if (!r.v.length) return openName(r, cfg);
  const ring = pick.ring || (r.v.some((v) => v.ring === T.ring) ? T.ring : r.v[0].ring);
  return monoFormName(r, cfg, ring, pick.an || T.an || r.v[0].an);
}

function quizNew() {
  closeQuizPop();
  const pool = quizPool();
  Q.empty = pool.ids.length < 2;
  if (Q.empty) { Q.opts = []; renderQuiz(); return; }
  let cand = pool.ids.filter((id) => id !== Q.last);
  if (!cand.length) cand = pool.ids;
  const id = cand[Math.floor(Math.random() * cand.length)];
  const kind = kindOf(id);
  // válaszlehetőségek a kérdések köréből; elsőként azonos fajtájúak (mono/di/poli)
  const others = shuffle(pool.ids.filter((x) => x !== id && kindOf(x) === kind))
    .concat(shuffle(pool.ids.filter((x) => x !== id && kindOf(x) !== kind)));
  Q.id = id;
  Q.last = id;
  Q.opts = shuffle([id, ...others.slice(0, optionCount(pool) - 1)]);
  Q.answered = false;
  Q.picked = null;
  Q.pick = {};
  Q.wrong = [];
  Q.ok = false;
  Q.view = SH.quiz.view === "mix" ? (Math.random() < 0.5 ? "3d" : "paper") : SH.quiz.view;
  const rec = recOf(id);
  const v = rec.v && rec.v.length ? rec.v[Math.floor(Math.random() * rec.v.length)] : null;
  // ha a D/L-t is kérdezi, véletlenszerűen D vagy L formát mutat
  const cfg = kind === "mono" && rec.cfg && SH.quiz.askCfg ? (Math.random() < 0.5 ? "D" : "L") : undefined;
  load(id, { vkey: v ? v.key : null, cfg });
  Q.truth = { cfg: st.cfg, ring: v && kind === "mono" ? v.ring : undefined, an: v ? v.an : undefined };
  renderQuiz();
}
/** Válasz: a molekula és (ha kérdezi) a formája. Csak akkor helyes, ha minden része jó. */
function quizAnswer(id, pick = {}) {
  if (!Q.on || Q.answered || !recOf(id)) return;
  closeQuizPop();
  const asked = askFor(Q.id);
  Q.answered = true;
  Q.picked = id;
  Q.pick = pick;
  Q.wrong = id === Q.id ? ASK_KEYS.filter((k) => asked[k] && pick[k] !== Q.truth[k]) : [];
  Q.ok = id === Q.id && !Q.wrong.length;
  SH.score.total++;
  if (Q.ok) SH.score.ok++;
  save();
  closeDrawers();
  renderQuiz();
  updateStaticUI();
  changed();
}
/** Egy lehetőségre kattintás: ha a formát is kérdezi, előbb a kis menü ugrik fel. */
function quizPick(id, btn) {
  if (!Q.on || Q.answered || !recOf(id)) return;
  const a = askFor(id);
  if (!ASK_KEYS.some((k) => a[k])) { quizAnswer(id); return; }
  openQuizPop(id, btn, a);
}

// ---- a válasz kiegészítése (felugró menü) ----
const QP = { id: null, ask: null, pick: {}, btn: null };
function openQuizPop(id, btn, ask) {
  const pop = $("#qPop");
  Object.assign(QP, { id, ask, pick: {}, btn });
  $("#qpName").textContent = recOf(id).name;
  $("#qpAnLab").textContent = kindOf(id) === "di" ? "A redukáló vég anomerje" : "Anomer";
  for (const row of $$(".qpop-row", pop)) {
    const k = row.dataset.k;
    row.hidden = !ask[k];
    for (const b of $$("button", row)) {
      b.setAttribute("aria-pressed", "false");
      // fejlesztői mód: a jó választás narancssárga keretet kap
      b.classList.toggle("dev-ok", showAnswers() && id === Q.id && Q.truth[k] === b.dataset.v);
    }
  }
  $$("#qOpts .opt").forEach((o) => o.classList.toggle("sel", o === btn));
  updateQuizPop();
  pop.hidden = false;
  positionQuizPop();
  const first = pop.querySelector(".qpop-row:not([hidden]) button");
  if (first) first.focus({ preventScroll: true });
}
function closeQuizPop() {
  const pop = $("#qPop");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  $$("#qOpts .opt.sel").forEach((o) => o.classList.remove("sel"));
  if (QP.btn && QP.btn.isConnected && !QP.btn.disabled) QP.btn.focus({ preventScroll: true });
  QP.btn = null;
}
function updateQuizPop() {
  const missing = ASK_KEYS.filter((k) => QP.ask[k] && !QP.pick[k]);
  for (const row of $$("#qPop .qpop-row")) {
    for (const b of $$("button", row)) b.setAttribute("aria-pressed", String(QP.pick[row.dataset.k] === b.dataset.v));
  }
  $("#qpOk").disabled = missing.length > 0;
  const el = $("#qpFull");
  if (missing.length) {
    el.textContent = `Add meg: ${missing.map((k) => ASK_NAME[k].replace(/^az? /, "")).join(", ")}.`;
  } else {
    el.innerHTML = "A válaszod: <b></b>";
    el.querySelector("b").textContent = fullNameOf(QP.id, QP.pick);
  }
}
function positionQuizPop() {
  const pop = $("#qPop"), b = QP.btn;
  if (pop.hidden || !b) return;
  const r = b.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
  let y = r.bottom + 6;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 6);
  pop.style.left = `${Math.round(x)}px`;
  pop.style.top = `${Math.round(y)}px`;
}
function bindQuizPop() {
  const pop = $("#qPop");
  pop.addEventListener("click", (e) => {
    const b = e.target.closest(".qpop-row button");
    if (!b) return;
    QP.pick[b.closest(".qpop-row").dataset.k] = b.dataset.v;
    updateQuizPop();
  });
  $("#qpOk").addEventListener("click", () => { if (!$("#qpOk").disabled) quizAnswer(QP.id, { ...QP.pick }); });
  $("#qpCancel").addEventListener("click", closeQuizPop);
  $("#qpClose").addEventListener("click", closeQuizPop);
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeQuizPop(); }
    else if (e.key === "Enter" && !e.target.closest(".qpop-row") && !$("#qpOk").disabled) {
      e.preventDefault();
      quizAnswer(QP.id, { ...QP.pick });
    }
  });
  // a menün kívülre kattintva bezárul (a lehetőségekre kattintás új menüt nyit)
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("#qOpts .opt")) closeQuizPop();
  });
  window.addEventListener("resize", positionQuizPop);
  $("#qOpts").addEventListener("scroll", positionQuizPop, { passive: true });
  $(".stage").addEventListener("scroll", positionQuizPop, { passive: true });
}

/** Hány válasz férjen egy sorba: beállítható, vagy a hely alapján automatikus. */
function perRow() {
  if (SH.quiz.perRow > 0) return SH.quiz.perRow;
  const n = Q.opts.length;
  const w = $("#qOpts").clientWidth || $("#quiz").clientWidth || 600;
  const fit = Math.max(2, Math.min(8, Math.floor((w + 8) / (window.innerWidth < 600 ? 122 : 142))));
  if (n <= fit) return Math.max(2, n);
  const rows = Math.ceil(n / fit);
  return rows > 3 ? fit : Math.ceil(n / rows); // kiegyensúlyozott sorok
}
function layoutOptions() {
  const box = $("#qOpts");
  const n = Q.opts.length, k = perRow();
  const rows = Math.ceil(n / k);
  // legfeljebb 3 sor (alacsony ablakban kevesebb, hogy a molekula kapjon helyet);
  // ha több kellene, a lehetőségek jobbra görgethetők
  const maxRows = window.innerHeight < 600 ? 1 : window.innerHeight < 820 ? 2 : 3;
  box.classList.toggle("scrolling", rows > maxRows);
  box.style.setProperty("--per-row", k);
  box.style.setProperty("--rows", Math.min(maxRows, rows));
  positionQuizPop();
}
/** A mód (nézegető / tippelő / analizáló) szerinti felület. */
function applyModeUI() {
  $("#quiz").hidden = !Q.on;
  $("#ana").hidden = !A.on;
  $(".title-block").hidden = Q.on || A.on;
  $(".app").classList.toggle("quiz-mode", Q.on);
  $(".app").classList.toggle("ana-mode", A.on);
  $(".app").classList.toggle("ana-done", A.on && A.done); // kiértékelés után az animáció is lejátszható
  $(".app").classList.toggle("print-mode", NY.on);
  $('#segMode button[data-v="print"]').hidden = !canPrint();
  const cur = currentMode();
  $$("#segMode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === cur)));
}
function renderQuiz() {
  applyModeUI();
  if (!Q.on) { closeQuizPop(); return; }
  const pool = quizPool();
  $("#qScore").textContent = `Helyes: ${SH.score.ok} / ${SH.score.total}`;
  $("#qPool").textContent = pool.fallback
    ? `Még nincs legalább két X-szel kijelölt molekula, ezért az összes (${pool.ids.length}) molekulából kérdezek. A bal oldali listában X-szel szűkítheted.`
    : pool.all
      ? `Az összes (${pool.ids.length}) molekulából kérdezek, ${optionCount(pool)} lehetőséggel.`
      : `${azA(pool.ids.length, true)} ${pool.ids.length} kijelölt (X) molekulából kérdezek, ${optionCount(pool)} lehetőséggel.`;
  const keepPop = !$("#qPop").hidden && !Q.answered ? QP.id : null;
  $("#qOpts").innerHTML = "";
  if (Q.empty || pool.ids.length < 2) {
    closeQuizPop();
    $("#qMsg").textContent = "Jelölj ki X-szel legalább két molekulát a bal oldali listában, vagy a beállításoknál válaszd, hogy az összesből kérdezzen.";
    $("#qNext").textContent = "Kezdés";
    return;
  }
  for (const id of Q.opts) {
    const r = recOf(id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt";
    b.dataset.id = id;
    b.innerHTML = `<span></span><small></small>`;
    b.querySelector("span").textContent = r.name;
    // összegképlet a név alatt (a tippelő beállításaiban kikapcsolható)
    if (SH.quiz.formula !== false) b.querySelector("small").textContent = r.formula;
    else b.querySelector("small").remove();
    if (Q.answered) {
      b.disabled = true;
      if (id === Q.id) b.classList.add(Q.wrong.length ? "half" : "ok");
      else if (id === Q.picked) b.classList.add("bad");
    } else if (showAnswers() && id === Q.id) {
      b.classList.add("dev-ok"); // fejlesztői mód: a jó válasz narancssárga
      b.title = "Ez a jó válasz (tanár/fejlesztői mód)";
    }
    $("#qOpts").appendChild(b);
  }
  layoutOptions();
  if (keepPop) {
    // a lehetőségek újrarajzolása után a menü a (most már új) gombhoz tartozik
    QP.btn = $(`#qOpts .opt[data-id="${keepPop}"]`);
    if (QP.btn) { QP.btn.classList.add("sel"); positionQuizPop(); } else closeQuizPop();
  }
  const r = recOf(Q.id);
  if (!Q.answered) {
    const c = SH.quiz;
    const what = c.askCfg || c.askRing || c.askAn ? " A molekulára kattintva a formáját is meg kell adnod (ahol értelmezhető)." : "";
    const anim = SH.quiz.anim === false ? "Forgasd, nézd meg alaposan" : "Forgasd, játszd le az animációt";
    $("#qMsg").textContent = `${anim}, aztán válassz!${what} A nézet: ${Q.view === "paper" ? "2D (papír)" : "3D"}.`;
    $("#qNext").textContent = "Másikat kérek";
  } else {
    const extra = st.di ? ` – ${bondInfo(r).long}` : st.poly ? ` – ${r.bondtext}` : "";
    let head, tail = "";
    if (Q.ok) head = "<b>Helyes!</b> Ez a molekula:";
    else if (Q.picked === Q.id) {
      head = "<b>Majdnem!</b> A molekula jó, de " +
        Q.wrong.map((k) => `${ASK_NAME[k]} ${askText(k, Q.truth[k])} volt, nem ${askText(k, Q.pick[k])}`).join("; ") + ". A molekula:";
    } else {
      head = "<b>Nem talált.</b> Ez volt a molekula:";
      const mine = ASK_KEYS.some((k) => Q.pick[k]) ? fullNameOf(Q.picked, Q.pick) : recOf(Q.picked).name;
      tail = ` (Te ezt választottad: ${mine.replace(/[<>&]/g, "")}.)`;
    }
    $("#qMsg").innerHTML = `${head} <b></b> · <span></span>${extra}${tail}`;
    $("#qMsg").querySelector("b:last-of-type").textContent = r.name;
    $("#qMsg").querySelector("span").textContent = stateName();
    $("#qNext").textContent = "Következő molekula";
  }
}
// ---- analizáló ---------------------------------------------------------------------------
// Egy véletlen, gyűrűs formájú mono- vagy diszacharid szürkén. Minden atomot fel kell
// iratozni (elem, sorszám, szerep), fent pedig megadni a formáját (D/L, gyűrű, α/β), a nevét és
// az összegképletét; diszacharidnál mindkét egységet, a kötést és hogy redukáló-e.
const ROLE_NAME = { none: "nincs", glyc: "glikozidos OH", ringO: "gyűrű-O", ficak: "ficak", kamu: "kamuficak", bridge: "kötés-O" };
const ROLE_SHORT = { glyc: "glik. OH", ringO: "gyűrű-O", ficak: "ficak", kamu: "kamuficak", bridge: "kötés-O" };
const plainFormula = (f) => f.replace(/[₀-₉]/g, (d) => String(SUBSCRIPT.indexOf(d)));
const carbonCount = (f) => +((/C(\d+)/.exec(plainFormula(f)) || [0, 1])[1]);
const COMBO_LISTS = {
  name: () => [...DATA.monos, ...DATA.dis].map((r) => ({ value: r.id, label: r.name, search: norm(`${r.name} ${r.alt || ""} ${r.id}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, "hu")),
  mono: () => DATA.monos.map((r) => ({ value: r.id, label: r.name, search: norm(`${r.name} ${r.alt || ""} ${r.id}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, "hu")),
  formula: () => [...new Set([...DATA.monos, ...DATA.dis].map((r) => r.formula))]
    .map((f) => ({ value: f, label: f, search: norm(`${f} ${plainFormula(f)}`) }))
    .sort((a, b) => carbonCount(a.value) - carbonCount(b.value) || a.label.localeCompare(b.label)),
  bond: () => [...new Set(DATA.dis.map((d) => d.link))]
    .map((l) => ({ value: l, label: l, search: norm(l) }))
    .sort((a, b) => a.label.replace(/[αβ]/g, "").localeCompare(b.label.replace(/[αβ]/g, "")) || a.label.localeCompare(b.label)),
};
const comboCache = {};
const comboList = (name) => (comboCache[name] ??= COMBO_LISTS[name]());
const comboLabel = (name, v) => (comboList(name).find((o) => o.value === v) || { label: v }).label;
// a felső rész mezői
const AF = {
  cfg: { label: "Konfiguráció", seg: [["D", "D"], ["L", "L"]] },
  ring: { label: "Gyűrű", seg: [["p", "6 tagú"], ["f", "5 tagú"]], short: [["p", "6"], ["f", "5"]] },
  an: { label: "Anomer", seg: [["a", "α"], ["b", "β"]] },
  red: { label: "Redukáló?", seg: [["y", "igen"], ["n", "nem"]] },
  name: { label: "Név", combo: "name" },
  formula: { label: "Összegképlet", combo: "formula" },
  bond: { label: "Glikozidos kötés", combo: "bond" },
  uname: { label: "Melyik monoszacharid", combo: "mono" },
};
function fieldDef(key) {
  const [a, b] = key.split(".");
  return b ? AF[b === "name" ? "uname" : b] : AF[a];
}
function anaRows() {
  const open = A.t === 0;
  if (!st.di) {
    // nyílt láncban nincs gyűrű és anomer; a D/L csak királis molekulánál értelmezhető
    const top = [...(st.rec.cfg ? ["cfg"] : []), ...(open ? [] : ["ring", "an"])];
    return [...(top.length ? [["", top]] : []), ["", ["name", "formula"]]];
  }
  return [
    ["1. egység", ["u1.name", "u1.cfg", "u1.ring", "u1.an"]],
    ["2. egység (′)", open ? ["u2.name", "u2.cfg"] : ["u2.name", "u2.cfg", "u2.ring", "u2.an"]],
    ["", [...(SH.ana.askBond !== false ? ["bond"] : []), "red"]],
    ["", ["name", "formula"]],
  ];
}
const anaKeys = () => anaRows().flatMap((r) => r[1]);

/** Egy atom az analizálóban: feliratozandó ("need"), megadott ("given") vagy rejtett ("hidden"). */
function anaState(i) {
  const m = model;
  if (!m || i >= m.N) return "hidden";
  const mode = (x) => (x === "hidden" ? "hidden" : x === "given" ? "given" : "need");
  if (m.ohSet.has(i) && SH.ana.oh !== "label") return mode(SH.ana.oh);
  if (m.el[i] === "H") return mode(SH.ana.h);
  return "need";
}
/** A megjelenítendő felirat: a megadott atomnál a helyes, különben a felhasználóé. */
function anaLabelOf(i) {
  const T = A.truth && A.truth.atoms[i];
  if (!T) return null;
  const s = anaState(i);
  if (s === "given") return T;
  return s === "need" ? A.labels.get(i) || null : null;
}
const labelEq = (u, t) => u.el === t.el && u.num === t.num && (t.num === 0 || !st.di || u.prime === t.prime) && u.role === t.role;
const fmtAtom = (L) => `${L.el}${L.num ? `${L.num}${st.di && L.prime ? "′" : ""}` : ""}`;
const fmtAtomRole = (L) => `${fmtAtom(L)}${L.role && L.role !== "none" ? ` · ${ROLE_SHORT[L.role]}` : ""}`;

function anaPool() {
  const ok = (id) => anaEligible(id) && anaForms(id).length > 0;
  const all = ALL_IDS.filter(ok);
  if (SH.ana.source === "all") return { ids: all, all: true };
  const ids = (SH.oset || []).filter(ok);
  // ha nincs bekarikázott, vagy egyik sem kérdezhető a választott formában, az összesből választ
  if (!ids.length) return { ids: all, all: true, fallback: (SH.oset || []).some(anaEligible) ? "form" : "empty" };
  return { ids, all: false };
}
function parseUnits(name) {
  return name.split(/-\(\d[→↔]\d\)-/).map((x) => ({
    cfg: (/-([DL])-/.exec(x) || [0, "D"])[1],
    ring: /furan/.test(x) ? "f" : "p",
    an: (/[αβ]/.exec(x) || ["α"])[0] === "α" ? "a" : "b",
  }));
}
/** A helyes válaszok a betöltött molekulából: atomonként elem, sorszám (′) és szerep; a forma és a nevek. */
function anaTruth() {
  const m = models.m3, r = st.rec, t = A.t, open = t === 0;
  const nb = Array.from({ length: m.N }, () => []);
  for (const b of m.bonds) if (b.alpha(t) > 0.5) { nb[b.i].push(b.j); nb[b.j].push(b.i); }
  // a sorszám a szénatomé: az O és a H a hozzá tartozó szénatom számát kapja
  const parse = (lab) => { const mm = /(\d+)/.exec(lab || ""); return { num: mm ? +mm[1] : 0, prime: /′/.test(lab || "") }; };
  const atoms = [];
  for (let i = 0; i < m.N; i++) {
    if (m.atomAlpha(t, i) < 0.5) continue; // (a kilépő víz atomjai)
    const el = m.el[i];
    let p;
    if (el === "H") {
      const j = nb[i].find((x) => m.el[x] !== "H");
      p = j === undefined ? { num: 0, prime: false } : parse(m.lab[j]);
    } else p = parse(m.lab[i]);
    // nyílt láncban a gyűrűs forma szerepei (gyűrű-O, glikozidos OH, ficak…) még nem léteznek
    let role = m.groupOf[i] || "none";
    if (open && (!st.di || (p.prime && role !== "bridge"))) role = "none";
    atoms[i] = { el, num: p.num, prime: p.prime, role };
  }
  const v = r.v.find((x) => x.key === st.vkey);
  const form = {};
  if (!st.di) {
    if (r.cfg) form.cfg = st.cfg;
    if (!open) Object.assign(form, { ring: v.ring, an: v.an });
  } else {
    const [u1, u2] = parseUnits(v.name);
    Object.assign(form, {
      "u1.name": r.A, "u1.cfg": u1.cfg, "u1.ring": u1.ring, "u1.an": u1.an,
      "u2.name": r.B, "u2.cfg": u2.cfg,
      bond: r.link, red: r.reducing ? "y" : "n",
    });
    if (!open) Object.assign(form, { "u2.ring": u2.ring, "u2.an": u2.an });
  }
  form.name = r.id;
  form.formula = r.formula;
  A.truth = { atoms, form };
}
function anaNew() {
  closeAnaPop();
  closeCombo();
  const pool = anaPool();
  let cand = pool.ids.filter((id) => id !== A.last);
  if (!cand.length) cand = pool.ids;
  const id = cand[Math.floor(Math.random() * cand.length)];
  const rec = recOf(id);
  const forms = anaForms(id), form = forms[Math.floor(Math.random() * forms.length)];
  Object.assign(A, { id, last: id, done: false, labels: new Map(), ans: {}, truth: null, res: null, t: form === "open" ? 0 : 1 });
  A.view = SH.ana.view === "mix" ? (Math.random() < 0.5 ? "3d" : "paper") : SH.ana.view;
  const v = rec.v.length ? rec.v[Math.floor(Math.random() * rec.v.length)] : null;
  const cfg = MONO.has(id) && rec.cfg ? (Math.random() < 0.5 ? "D" : "L") : undefined;
  load(id, { vkey: v ? v.key : null, cfg });
  // nyílt forma: a gyűrűzáródás elején (diszacharidnál a redukáló vég nyílt)
  st.playing = false;
  st.t = A.t;
  fitCamera();
  anaTruth();
  refreshAnaLabels();
  renderAna();
  updateStaticUI();
  changed();
}

// ---- a feliratok a 3D-térben ----
function refreshAnaLabels() {
  if (!A.on) return;
  const T = A.truth;
  for (const L of labelEls) {
    if (!L.ana) continue;
    const i = L.i, t = T && T.atoms[i], s = t ? anaState(i) : "hidden";
    let text = "", cls = "lbl ana";
    if (t && s !== "hidden") {
      if (s === "given") { text = fmtAtomRole(t); cls += " given"; }
      else if (A.done) {
        // jó: zöld; rossz: „a te feliratod → helyes”; kimaradt: csak a helyes, pirosan
        const u = A.labels.get(i), ok = !!u && labelEq(u, t);
        text = ok || !u ? fmtAtomRole(t) : `${fmtAtomRole(u)} → ${fmtAtomRole(t)}`;
        cls += ok ? " ok" : " bad";
      } else {
        const u = A.labels.get(i);
        if (u) text = fmtAtomRole(u);
      }
    }
    L.el.className = cls;
    L.el.textContent = text;
    L.has = !!text;
  }
}
function anaTip(i) {
  const s = anaState(i), L = anaLabelOf(i);
  if (s === "given" && L) return `<b>${fmtAtomRole(L)}</b> · megadva`;
  if (L) return `<b>${fmtAtomRole(L)}</b> · a te feliratod (kattints a módosításhoz)`;
  return "Kattints rá a feliratozáshoz";
}

// ---- a felső rész: forma, nevek, összegképlet ----
const CHEV_DOWN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
function anaFieldEl(key, compact) {
  const d = fieldDef(key), f = document.createElement("div");
  f.className = "ana-field";
  f.dataset.key = key;
  const lab = document.createElement("span");
  lab.className = "lab";
  lab.textContent = d.label;
  f.appendChild(lab);
  if (d.seg) {
    const g = document.createElement("div");
    g.className = "seg mini-seg";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", d.label);
    const opts = compact && d.short ? d.short : d.seg;
    opts.forEach(([v, t], k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = v;
      b.textContent = t;
      if (opts !== d.seg) b.title = d.seg[k][1];
      g.appendChild(b);
    });
    f.appendChild(g);
  } else {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "combo-btn";
    b.dataset.key = key;
    b.setAttribute("aria-haspopup", "listbox");
    b.setAttribute("aria-label", d.label);
    b.innerHTML = `<span class="v"></span>${CHEV_DOWN}`;
    f.appendChild(b);
  }
  const tr = document.createElement("span");
  tr.className = "truth";
  f.appendChild(tr);
  return f;
}
function renderAna() {
  applyModeUI();
  if (!A.on) { closeAnaPop(); closeCombo(); return; }
  const sc = SH.anaScore;
  $("#aScore").textContent = `Hibátlan: ${sc.ok} / ${sc.total}${sc.max ? ` · átlag ${Math.round((100 * sc.pts) / sc.max)}%` : ""}`;
  const pool = anaPool();
  $("#aPool").textContent = pool.fallback === "form"
    ? `A bekarikázott molekulák egyike sem kérdezhető a választott formában (pl. a nem redukáló diszacharidoknak nincs nyílt formája), ezért az összes (${pool.ids.length}) molekulából választok.`
    : pool.fallback
    ? `Még nincs bekarikázott molekula, ezért az összes (${pool.ids.length}) mono- és diszacharidból választok. A bal oldali listában karikával szűkítheted.`
    : pool.all
      ? `Az összes (${pool.ids.length}) mono- és diszacharidból választok.`
      : `${azA(pool.ids.length, true)} ${pool.ids.length} bekarikázott molekulából választok.`;
  const box = $("#aForm");
  box.innerHTML = "";
  if (!A.truth) return;
  let rows = anaRows();
  if (st.di) {
    // a két egység kis táblázatban: fejléc + soronként egy egység (helytakarékos)
    const tbl = document.createElement("div");
    tbl.className = "ana-units";
    for (const h of ["", "Monoszacharid", "Konfiguráció", "Gyűrű (tag)", "Anomer"]) {
      const c = document.createElement("span");
      c.className = "uh";
      c.textContent = h;
      tbl.appendChild(c);
    }
    for (const [title, keys] of rows.slice(0, 2)) {
      const c = document.createElement("span");
      c.className = "rlab";
      c.textContent = title;
      tbl.appendChild(c);
      for (const key of keys) {
        const f = anaFieldEl(key, true);
        f.classList.add("cell");
        tbl.appendChild(f);
      }
      if (keys.length < 4) {
        const na = document.createElement("span");
        na.className = "na";
        na.style.gridColumn = `span ${4 - keys.length}`;
        na.textContent = "nyílt lánc: nincs gyűrű és anomer";
        tbl.appendChild(na);
      }
    }
    box.appendChild(tbl);
    rows = rows.slice(2);
  }
  for (const [title, keys] of rows) {
    const row = document.createElement("div");
    row.className = "ana-row";
    if (title) {
      const h = document.createElement("span");
      h.className = "rlab";
      h.textContent = title;
      row.appendChild(h);
    }
    for (const key of keys) row.appendChild(anaFieldEl(key));
    box.appendChild(row);
  }
  updateAnaForm();
}
function updateAnaForm() {
  if (!A.on) return;
  const T = A.truth ? A.truth.form : {};
  for (const f of $$("#aForm .ana-field")) {
    const key = f.dataset.key, d = fieldDef(key), val = A.ans[key], tv = T[key];
    if (d.seg) {
      for (const b of $$("button", f)) {
        b.setAttribute("aria-pressed", String(b.dataset.v === val));
        b.classList.toggle("dev-ok", showAnswers() && !A.done && b.dataset.v === tv);
        b.classList.toggle("ok", A.done && b.dataset.v === tv);
        b.classList.toggle("bad", A.done && b.dataset.v === val && val !== tv);
        b.disabled = A.done;
      }
    } else {
      const b = f.querySelector(".combo-btn");
      b.querySelector(".v").textContent = val ? comboLabel(d.combo, val) : "Válassz…";
      b.classList.toggle("empty", !val);
      b.disabled = A.done;
    }
    f.classList.toggle("ok", A.done && val === tv);
    f.classList.toggle("bad", A.done && val !== tv);
    const truthText = d.seg ? (d.seg.find((x) => x[0] === tv) || [0, tv])[1] : comboLabel(d.combo, tv);
    f.querySelector(".truth").textContent = A.done && val !== tv ? `helyes: ${truthText}` : "";
  }
  updateAnaProgress();
}
function anaCounts() {
  const T = A.truth;
  let need = 0, done = 0;
  if (T) {
    for (let i = 0; i < T.atoms.length; i++) {
      if (!T.atoms[i] || anaState(i) !== "need") continue;
      need++;
      if (A.labels.has(i)) done++;
    }
  }
  const keys = anaKeys();
  return { need, done, keys: keys.length, filled: keys.filter((k) => A.ans[k] !== undefined).length };
}
function updateAnaProgress() {
  if (!A.on) return;
  const msg = $("#aMsg");
  const c0 = anaCounts(), open = !$("#ana").classList.contains("collapsed");
  $("#aToggle").textContent = `${open ? "Adatok elrejtése" : "Adatok megadása"} (${c0.filled}/${c0.keys})`;
  if (!A.done) {
    const c = c0;
    msg.innerHTML = `Feliratozva: <b>${c.done}/${c.need}</b> atom · kitöltve: <b>${c.filled}/${c.keys}</b> adat. Kattints egy atomra a feliratozáshoz!`;
    $("#aCheck").hidden = false;
    $("#aFill").hidden = !showAnswers();
    $("#aNext").textContent = "Másikat kérek";
    return;
  }
  const R = A.res, pts = R.aOk + R.fOk, max = R.aTot + R.fTot;
  const head = pts === max ? "Hibátlan!" : `Eredmény: ${pts}/${max} pont (${Math.round((100 * pts) / max)}%).`;
  const anim = hasTimeline() ? " Most már lejátszhatod az animációt is." : "";
  msg.innerHTML = `<b>${head}</b> Atomok: ${R.aOk}/${R.aTot} · adatok: ${R.fOk}/${R.fTot}. A molekula: <b></b> · <span></span>.${anim}`;
  msg.querySelector("b:last-of-type").textContent = st.rec.name;
  msg.querySelector("span").textContent = stateName();
  $("#aCheck").hidden = true;
  $("#aFill").hidden = true;
  $("#aNext").textContent = "Következő molekula";
}
/** Fejlesztői mód: minden feliratot és adatot kitölt a helyes válasszal (ellenőrzéshez). */
function anaFill() {
  if (!A.on || A.done || !A.truth || !showAnswers()) return;
  const T = A.truth;
  T.atoms.forEach((t, i) => { if (t && anaState(i) === "need") A.labels.set(i, { ...t }); });
  for (const k of anaKeys()) A.ans[k] = T.form[k];
  refreshAnaLabels();
  updateAnaForm();
  changed();
}
/** Telefonon az adatok összecsukhatók (a gomb szövegén látszik, hány van kitöltve). */
function setAnaCollapsed(on) {
  $("#ana").classList.toggle("collapsed", on);
  $("#aToggle").setAttribute("aria-expanded", String(!on));
  updateAnaProgress();
}
function anaEvaluate() {
  if (!A.on || A.done || !A.truth) return;
  setAnaCollapsed(false); // az eredmény mezőnként is látsszon
  closeAnaPop();
  closeCombo();
  const T = A.truth;
  let aOk = 0, aTot = 0;
  for (let i = 0; i < T.atoms.length; i++) {
    const t = T.atoms[i];
    if (!t || anaState(i) !== "need") continue;
    aTot++;
    const u = A.labels.get(i);
    if (u && labelEq(u, t)) aOk++;
  }
  const keys = anaKeys();
  const fOk = keys.filter((k) => A.ans[k] === T.form[k]).length;
  A.res = { aOk, aTot, fOk, fTot: keys.length };
  A.done = true;
  const sc = SH.anaScore, pts = aOk + fOk, max = aTot + keys.length;
  sc.total++;
  if (pts === max) sc.ok++;
  sc.pts += pts;
  sc.max += max;
  save();
  renderAna();
  refreshAnaLabels();
  updateStaticUI();
  changed();
}

// ---- atom feliratozása (felugró menü) ----
const AP = { i: null, pick: {}, fresh: true, x: 0, y: 0 };
const AP_NAMES = { el: "elem", num: "sorszám", prime: "egység", role: "szerep" };
/** Szerepet csak ott kérdez, ahol van gyűrű (nyílt láncú monoszacharidnál nincs). */
const anaAskRole = () => !(A.t === 0 && !st.di);
function anaPopNeeds() {
  const k = ["el", "num"];
  if (anaAskRole()) k.push("role");
  if (st.di && AP.pick.num !== "0") k.push("prime");
  return k;
}
function openAnaPop(i, x, y) {
  const u = A.labels.get(i);
  AP.i = i;
  AP.fresh = !u;
  AP.x = x;
  AP.y = y;
  AP.pick = u ? { el: u.el, num: String(u.num), prime: u.prime ? "1" : "0", role: u.role } : {};
  $("#apTitle").textContent = u ? "Felirat módosítása" : "Melyik atom ez?";
  $('#aPop button[data-v="bridge"]').hidden = !st.di;
  $("#aPop").hidden = false;
  updateAnaPop();
  positionAnaPop();
  const first = $("#aPop .qpop-row:not([hidden]) button");
  if (first) first.focus({ preventScroll: true });
}
function closeAnaPop() {
  const pop = $("#aPop");
  if (pop) pop.hidden = true;
  AP.i = null;
}
function updateAnaPop() {
  const T = A.truth && A.truth.atoms[AP.i];
  for (const row of $$("#aPop .qpop-row")) {
    const k = row.dataset.k;
    row.hidden = (k === "prime" && (!st.di || AP.pick.num === "0")) || (k === "role" && !anaAskRole());
    const tv = !T ? null : k === "num" ? String(T.num) : k === "prime" ? (T.prime ? "1" : "0") : T[k];
    for (const b of $$("button", row)) {
      b.setAttribute("aria-pressed", String(AP.pick[k] === b.dataset.v));
      b.classList.toggle("dev-ok", showAnswers() && b.dataset.v === tv); // tanár/fejlesztői mód: a jó választás
    }
  }
  const missing = anaPopNeeds().filter((k) => AP.pick[k] === undefined);
  $("#apOk").disabled = missing.length > 0;
  $("#apClear").hidden = AP.fresh;
  const el = $("#apPreview");
  if (missing.length) el.textContent = `Add meg: ${missing.map((k) => AP_NAMES[k]).join(", ")}.`;
  else {
    el.innerHTML = "Felirat: <b></b>";
    el.querySelector("b").textContent = fmtAtomRole({ el: AP.pick.el, num: +AP.pick.num, prime: AP.pick.prime === "1", role: anaAskRole() ? AP.pick.role : "none" });
  }
}
function applyAnaPop() {
  if (AP.i === null || anaPopNeeds().some((k) => AP.pick[k] === undefined)) return;
  const p = AP.pick;
  A.labels.set(AP.i, { el: p.el, num: +p.num, prime: st.di && p.num !== "0" && p.prime === "1", role: anaAskRole() ? p.role : "none" });
  closeAnaPop();
  refreshAnaLabels();
  updateAnaProgress();
  changed();
}
function positionAnaPop() {
  const pop = $("#aPop");
  if (pop.hidden) return;
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - pw - 8, AP.x + 14));
  let y = AP.y + 14;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, AP.y - ph - 14);
  pop.style.left = `${Math.round(x)}px`;
  pop.style.top = `${Math.round(y)}px`;
}
function bindAnaPop() {
  const pop = $("#aPop");
  pop.addEventListener("click", (e) => {
    const b = e.target.closest(".qpop-row button");
    if (!b) return;
    AP.pick[b.closest(".qpop-row").dataset.k] = b.dataset.v;
    // új feliratnál, ha minden megvan, azonnal elmenti (gyorsabb feliratozás)
    if (AP.fresh && !anaPopNeeds().some((k) => AP.pick[k] === undefined)) applyAnaPop();
    else updateAnaPop();
  });
  $("#apOk").addEventListener("click", applyAnaPop);
  $("#apClose").addEventListener("click", closeAnaPop);
  $("#apClear").addEventListener("click", () => {
    A.labels.delete(AP.i);
    closeAnaPop();
    refreshAnaLabels();
    updateAnaProgress();
    changed();
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAnaPop(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== canvas) closeAnaPop();
  });
  window.addEventListener("resize", positionAnaPop);
}

// ---- kereshető lenyíló lista ----
const CB = { key: null, btn: null, items: [], active: 0 };
function openCombo(key, btn) {
  CB.key = key;
  CB.btn = btn;
  CB.name = fieldDef(key).combo;
  CB.active = 0;
  const pop = $("#comboPop");
  $("#comboSearch").value = "";
  pop.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  renderComboList();
  positionCombo();
  // érintőképernyőn nem nyitjuk fel azonnal a billentyűzetet
  if (!window.matchMedia("(pointer: coarse)").matches) $("#comboSearch").focus({ preventScroll: true });
}
function closeCombo() {
  const pop = $("#comboPop");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (CB.btn) CB.btn.setAttribute("aria-expanded", "false");
  CB.btn = null;
}
function renderComboList() {
  const q = norm($("#comboSearch").value.trim());
  CB.items = comboList(CB.name).filter((o) => !q || o.search.includes(q));
  CB.active = Math.max(0, Math.min(CB.active, CB.items.length - 1));
  const tv = A.truth && A.truth.form[CB.key], val = A.ans[CB.key];
  const ul = $("#comboList");
  ul.innerHTML = "";
  CB.items.forEach((o, k) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.v = o.value;
    li.id = `combo-opt-${k}`;
    li.textContent = o.label;
    li.setAttribute("aria-selected", String(o.value === val));
    li.classList.toggle("active", k === CB.active);
    li.classList.toggle("dev-ok", showAnswers() && o.value === tv); // tanár/fejlesztői mód: a jó válasz
    ul.appendChild(li);
  });
  if (!CB.items.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "Nincs találat.";
    ul.appendChild(li);
  }
  $("#comboSearch").setAttribute("aria-activedescendant", CB.items.length ? `combo-opt-${CB.active}` : "");
}
function chooseCombo(v) {
  if (!CB.key) return;
  A.ans[CB.key] = v;
  const btn = CB.btn;
  closeCombo();
  updateAnaForm();
  if (btn) btn.focus({ preventScroll: true });
}
function positionCombo() {
  const pop = $("#comboPop"), b = CB.btn;
  if (pop.hidden || !b) return;
  const r = b.getBoundingClientRect();
  const w = Math.min(window.innerWidth - 16, Math.max(r.width, 260));
  pop.style.width = `${Math.round(w)}px`;
  const ph = pop.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
  let y = r.bottom + 4;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 4);
  pop.style.left = `${Math.round(x)}px`;
  pop.style.top = `${Math.round(y)}px`;
}
function bindCombo() {
  const pop = $("#comboPop"), input = $("#comboSearch");
  input.addEventListener("input", () => { CB.active = 0; renderComboList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!CB.items.length) return;
      CB.active = (CB.active + (e.key === "ArrowDown" ? 1 : -1) + CB.items.length) % CB.items.length;
      renderComboList();
      const a = $("#comboList li.active");
      if (a) a.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (CB.items[CB.active]) chooseCombo(CB.items[CB.active].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      const btn = CB.btn;
      closeCombo();
      if (btn) btn.focus({ preventScroll: true });
    }
  });
  $("#comboList").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-v]");
    if (li) chooseCombo(li.dataset.v);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".combo-btn")) closeCombo();
  });
  window.addEventListener("resize", positionCombo);
  $(".stage").addEventListener("scroll", () => { positionCombo(); positionAnaPop(); }, { passive: true });
}

// ---- az analizáló beállításai és gombjai ----
function syncAnaSettings() {
  const c = SH.ana;
  $$("#asView button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === c.view)));
  $$("#asForm button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (c.form || "mix"))));
  $$("#asSource button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === c.source)));
  $$("#asH button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === c.h)));
  $$("#asOH button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === c.oh)));
  $("#asSourceO").textContent = `Bekarikázottak (${(SH.oset || []).filter(anaEligible).length})`;
  $("#asSourceAll").textContent = `Összes (${ALL_IDS.filter((id) => anaEligible(id) && anaForms(id).length).length})`;
  $("#asBond").checked = c.askBond !== false;
}
function bindAna() {
  const seg = (id, key, after) => {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      SH.ana[key] = b.dataset.v;
      save();
      syncAnaSettings();
      if (after) after();
    });
  };
  seg("#asView", "view");
  // ha a mostani feladat formája már nem választható, újat kér
  seg("#asForm", "form", () => {
    if (!A.on || A.done) return;
    const ok = anaForms(A.id).includes(A.t === 0 ? "open" : "ring");
    if (!ok || !anaPool().ids.includes(A.id)) anaNew(); else renderAna();
  });
  seg("#asSource", "source", () => { if (A.on && !A.done && !anaPool().ids.includes(A.id)) anaNew(); else renderAna(); });
  const relabel = () => { if (A.on) { refreshAnaLabels(); updateAnaProgress(); changed(); } };
  seg("#asH", "h", relabel);
  seg("#asOH", "oh", relabel);
  $("#asBond").addEventListener("change", (e) => {
    SH.ana.askBond = e.target.checked;
    save();
    if (A.on && !A.done) { delete A.ans.bond; renderAna(); }
  });
  $("#asFromFav").addEventListener("click", () => setOset(SH.fav));
  $("#asClearO").addEventListener("click", () => setOset([]));
  $("#aNext").addEventListener("click", anaNew);
  $("#aCheck").addEventListener("click", anaEvaluate);
  $("#aFill").addEventListener("click", anaFill);
  $("#aToggle").addEventListener("click", () => setAnaCollapsed(!$("#ana").classList.contains("collapsed")));
  $("#aForm").addEventListener("click", (e) => {
    if (A.done) return;
    const cb = e.target.closest(".combo-btn");
    if (cb) {
      if (CB.btn === cb) closeCombo();
      else openCombo(cb.dataset.key, cb);
      return;
    }
    const b = e.target.closest(".seg button");
    if (!b) return;
    const key = b.closest(".ana-field").dataset.key;
    A.ans[key] = b.dataset.v;
    updateAnaForm();
  });
  bindAnaPop();
  bindCombo();
  syncAnaSettings();
}

function setMode(mode) {
  if (!["view", "quiz", "ana", "print"].includes(mode) || mode === currentMode()) return;
  if (mode === "print" && !canPrint()) return; // a nyomda csak tanár- és fejlesztői módban
  if (DBG.running) stopDebug(); // a hibakereső a nézegetőben fut
  closeQuizPop();
  closeAnaPop();
  closeCombo();
  Q.on = mode === "quiz";
  A.on = mode === "ana";
  NY.on = mode === "print";
  st.playing = false;
  if (Q.on) {
    // a tippelő először a nézegető beállításait és csillagait veszi át
    if (!SQ) SQ = clone(SV);
    if (!SH.xset) SH.xset = [...SH.fav];
    S = SQ;
  } else if (NY.on) {
    // a nyomda saját beállításokkal dolgozik (elsőre a nézegetőéit veszi át)
    if (!SPR) SPR = clone(SV);
    S = SPR;
  } else {
    S = SV;
  }
  // az analizáló a csillagozottakat veszi át (az X-eket nem)
  if (A.on && !SH.oset) SH.oset = SH.fav.filter(anaEligible);
  save();
  refreshHl();
  refreshElColors();
  syncControls();
  syncQuizSettings();
  syncAnaSettings();
  buildTree();
  if (Q.on) {
    renderAna();
    quizNew();
    try { history.replaceState(null, "", "#tippelo"); } catch { /* beágyazott nézet */ }
  } else if (A.on) {
    renderQuiz();
    anaNew();
    try { history.replaceState(null, "", "#analizalo"); } catch { /* beágyazott nézet */ }
  } else {
    try { history.replaceState(null, "", NY.on ? "#nyomda" : `#${st.rec.id}`); } catch { /* beágyazott nézet */ }
    renderQuiz();
    renderAna();
    syncPrintSettings();
    pickModels();
    fitCamera();
    markCurrent();
    updateStaticUI();
    changed();
  }
}

// ---- tippelő beállításai -------------------------------------------------------------
function syncQuizSettings() {
  const c = SH.quiz, pool = quizPool();
  $$("#qsView button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === c.view)));
  $$("#qsSource button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === c.source)));
  const nx = (SH.xset || []).filter((id) => recOf(id)).length;
  $("#qsSourceX").textContent = `Kijelöltek (${nx})`;
  $("#qsSourceAll").textContent = `Összes (${ALL_IDS.length})`;
  const max = Math.max(2, pool.ids.length);
  const cnt = $("#qsCount");
  cnt.max = String(max);
  cnt.value = String(Math.min(c.count, max));
  $("#qsCountVal").textContent = pool.ids.length >= 2 ? String(Math.min(c.count, max)) : "–";
  $("#qsCountHint").textContent = pool.ids.length >= 2
    ? `Legfeljebb ${max}: ennyi molekula van a kérdések körében.`
    : "Előbb jelölj ki legalább két molekulát.";
  cnt.disabled = pool.ids.length < 3;
  $("#qsPerRow").value = String(c.perRow || 0);
  $("#qsFormula").checked = c.formula !== false;
  $("#qsAskCfg").checked = !!c.askCfg;
  $("#qsAskRing").checked = !!c.askRing;
  $("#qsAskAn").checked = !!c.askAn;
  $("#qsAnim").checked = c.anim !== false;
}
function bindQuizSettings() {
  $("#qsView").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    SH.quiz.view = b.dataset.v;
    save(); syncQuizSettings();
  });
  $("#qsSource").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    SH.quiz.source = b.dataset.v;
    save(); syncQuizSettings();
    if (Q.on && (Q.empty || !quizPool().ids.includes(Q.id))) quizNew();
    else renderQuiz();
  });
  $("#qsCount").addEventListener("input", (e) => {
    SH.quiz.count = +e.target.value;
    save(); syncQuizSettings();
  });
  $("#qsCount").addEventListener("change", () => { if (Q.on && !Q.answered) quizNew(); });
  $("#qsFormula").addEventListener("change", (e) => {
    SH.quiz.formula = e.target.checked;
    save(); renderQuiz();
  });
  $("#qsPerRow").addEventListener("change", (e) => {
    SH.quiz.perRow = +e.target.value;
    save(); layoutOptions();
  });
  for (const [id, key] of [["#qsAskCfg", "askCfg"], ["#qsAskRing", "askRing"], ["#qsAskAn", "askAn"]]) {
    $(id).addEventListener("change", (e) => {
      SH.quiz[key] = e.target.checked;
      save();
      closeQuizPop();
      // a D/L kérdezésekor a konfiguráció véletlenszerű, ezért új kérdés kell
      if (Q.on && !Q.answered && key === "askCfg") quizNew();
      else renderQuiz();
    });
  }
  $("#qsAnim").addEventListener("change", (e) => {
    SH.quiz.anim = e.target.checked;
    save();
    if (quizAnimLocked() && model && model.kind !== "static") { st.playing = false; st.t = 1; }
    updateStaticUI();
    renderQuiz();
    changed();
  });
  $("#qsFromFav").addEventListener("click", () => setXset(SH.fav.filter((id) => recOf(id))));
  $("#qsClearX").addEventListener("click", () => setXset([]));
  $("#qsCopyView").addEventListener("click", () => {
    SQ = clone(SV);
    S = Q.on ? SQ : SV;
    save(); refreshHl(); refreshElColors(); syncControls(); changed();
  });
  new ResizeObserver(() => { if (Q.on && SH.quiz.perRow === 0) layoutOptions(); }).observe($("#quiz"));
}

function pickModels() {
  const paper = (Q.on ? Q.view : A.on ? A.view : S.view) === "paper" && models.mP;
  model = paper ? models.mP : models.m3;
  holoModel = undefined; // a hologram első bekapcsolásakor készül el
  P = null;
  HP = HX = null;
  mainLayer.build(model);
  holoLayer.build(null);
  buildLabels();
}
function rebuild(refit) {
  models = getModels();
  pickModels();
  if (refit) fitCamera();
  updateStaticUI();
  changed();
}

let dirty = true;
function changed() { dirty = true; }

/** Redukáló-e a molekula (a nézegető címkéjéhez), rövid magyarázattal. */
function reducingInfo(r) {
  if (MONO.has(r.id)) return { text: "redukáló", tip: "Minden monoszacharid redukáló: nyílt láncú formájában szabad aldehid- vagy ketocsoportja van (pl. pozitív Fehling- és ezüsttükörpróba)." };
  if (DI.has(r.id)) {
    return r.reducing
      ? { text: "redukáló", tip: "Redukáló: a második egység glikozidos OH-ja szabad, ezért gyűrűje felnyílhat." }
      : { text: "nem redukáló", tip: "Nem redukáló: mindkét glikozidos OH a kötésben van, egyik gyűrű sem nyílhat fel." };
  }
  return { text: "nem redukáló", tip: "Gyakorlatilag nem redukáló: a hosszú láncnak csak egyetlen redukáló vége van (pl. negatív Fehling-próba)." };
}
function fmtMass(m) { return `${m.toFixed(2).replace(".", ",")} g/mol`; }

/** A glikozidos kötés leírása: α/β és a kapcsolódó szénatomok. */
function bondInfo(r) {
  const m = /^([αβ])\((\d)([→↔])(\d)\)([αβ]?)$/.exec(r.link);
  if (!m) return { short: r.link, long: r.link };
  const word = { "α": "alfa", "β": "béta" };
  const type = m[5] ? `${m[1]},${m[5]}` : m[1];
  const short = `${type}-glikozidos kötés · C${m[2]} ${m[3]} C${m[4]}′`;
  const long = `${r.link} glikozidos kötés: ${m[5] ? `${word[m[1]]}–${word[m[5]]}` : word[m[1]]} kötés az első egység ` +
    `(${unitName(r.A)}) C${m[2]} és a második egység (${unitName(r.B)}) C${m[4]}′ szénatomja között, oxigénhídon át.` +
    (m[5] ? " Mindkét glikozidos szénatom részt vesz benne." : "");
  return { short, long };
}

function updateStaticUI() {
  const r = st.rec;
  $("#title").textContent = r.name;
  $("#alt").textContent = r.alt ? r.alt : "";
  $("#desc").textContent = r.desc;
  document.title = Q.on ? "Tippelő – Szénhidrát 3D" : `${r.name} – Szénhidrát 3D`;
  $("#formHint").hidden = quizHidden();
  // a tippelőben válasz előtt a forma (D/L, gyűrű, anomer) nem látszik és nem váltható
  $("#secForma").hidden = quizHidden();
  if (st.poly) {
    $("#eyebrow").textContent = `Poliszacharid · ${POLY_GROUP[r.group].replace(/ \(.*\)/, "").toLowerCase()} · ${r.nres} egységes részlet`;
  } else if (!st.di) {
    $("#eyebrow").textContent = `Monoszacharid · ${CLS1[r.n]} · ${SUB1[r.sub]}`;
  } else {
    $("#eyebrow").textContent = `Diszacharid · ${unitName(r.A)} + ${unitName(r.B)}`;
  }
  // forma-választók
  const cfgBtns = $$("#segCfg button");
  const chiral = !st.di && !st.poly && !!r.cfg;
  cfgBtns.forEach((b) => { b.disabled = !chiral; b.setAttribute("aria-pressed", String(chiral && b.dataset.v === st.cfg)); });
  const ringBtns = $$("#segRing button"), anBtns = $$("#segAn button");
  let hint = "";
  if (st.poly) {
    ringBtns.forEach((b) => { b.disabled = true; b.setAttribute("aria-pressed", "false"); });
    anBtns.forEach((b) => { b.disabled = true; b.setAttribute("aria-pressed", "false"); });
    $("#anLab").textContent = "Anomer";
    hint = `Poliszacharid-részlet ${r.nres} egységgel. A valódi molekula: ${r.real || "sok száz–sok ezer egység"}.`;
  } else if (!st.di) {
    const rings = new Set(r.v.map((v) => v.ring));
    const cur = r.v.find((v) => v.key === st.vkey);
    ringBtns.forEach((b) => { b.disabled = !rings.has(b.dataset.v); b.setAttribute("aria-pressed", String(!!cur && cur.ring === b.dataset.v)); });
    anBtns.forEach((b) => { b.disabled = !cur; b.setAttribute("aria-pressed", String(!!cur && cur.an === b.dataset.v)); });
    $("#anLab").textContent = "Anomer";
    if (!r.cfg) hint = "Nincs királis szénatomja, ezért nincs D- és L-formája.";
    if (!r.v.length) hint = (hint ? hint + " " : "") + "Gyűrűt nem képez, csak nyílt láncú formája van.";
    else if (rings.size === 1) hint = `Csak ${[...rings][0] === "p" ? "hattagú (piranóz)" : "öttagú (furanóz)"} gyűrűt képez.`;
  } else {
    const v = r.v.find((x) => x.key === st.vkey);
    const ringB = /furan[^-]*$/.test(v.name) ? "f" : "p";
    ringBtns.forEach((b) => { b.disabled = true; b.setAttribute("aria-pressed", String(b.dataset.v === ringB)); });
    anBtns.forEach((b) => { b.disabled = !r.reducing; b.setAttribute("aria-pressed", String(v.an === b.dataset.v)); });
    $("#anLab").textContent = r.reducing ? "A redukáló vég anomerje" : "Anomer";
    hint = r.reducing
      ? "A második egység glikozidos OH-ja szabad: ez a redukáló vég, ennek gyűrűje nyílhat fel."
      : "Mindkét anomer szénatom a glikozidos kötésben vesz részt, ezért az anomerek rögzítettek.";
  }
  $("#formHint").textContent = hint;
  // kiemelés-sorok elérhetősége
  for (const g of GROUPS) {
    const row = $(`.hl-row[data-g="${g.key}"]`);
    const present = model.present.has(g.key);
    row.classList.toggle("absent", !present);
    row.title = present ? "" : "Ennél a molekulánál nincs ilyen csoport.";
  }
  // idővonal-fülek
  const tabs = $$("#tlTabs button");
  $("#tlTabs").hidden = !st.di;
  tabs.forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.tl === st.tl));
    b.disabled = (b.dataset.tl === "closure" && st.di && !r.reducing) || quizAnimLocked();
  });
  const tl = hasTimeline();
  for (const id of ["#btnStart", "#btnEnd", "#btnPlay", "#scrub", "#speed"]) $(id).disabled = !tl;
  const cond = model.kind === "cond";
  $("#btnStart").textContent = st.poly ? "Első egység" : cond ? "Két monoszacharid" : model.paper ? "Fischer-projekció" : "Nyílt lánc";
  $("#btnEnd").textContent = st.poly ? "Kész lánc" : cond ? "Diszacharid" : model.paper ? "Haworth-képlet" : "Gyűrűs forma";
  // nézet és hologram
  const hasPaper = models.paperOk;
  $$("#segView button, #segViewQ button").forEach((b) => {
    b.disabled = Q.on || A.on || (b.dataset.v === "paper" && !hasPaper);
    b.setAttribute("aria-pressed", String(b.dataset.v === (model.paper ? "paper" : "3d")));
  });
  $("#holoHint").textContent = model.paper
    ? "A valódi térbeli modellt vetíti áttetszően a papírmodellre."
    : "A papírmodellt (Fischer-projekció / Haworth-képlet) vetíti áttetszően a 3D modellre.";
}

// ---- állapotfüggő szövegek -------------------------------------------------------
function stateName() {
  const r = st.rec, t = st.t;
  if (st.poly) return `Ismétlődő egység: ${r.repeat}`;
  if (!st.di) {
    const v = model.v;
    if (!v || t <= 0.001) return `${lowerName(r)} – ${model.paper ? "Fischer-projekció" : "nyílt láncú forma"}`;
    const nm = v.name.replace("{cfg}", st.cfg);
    if (t >= 0.999) return model.paper ? `${nm} – Haworth-képlet` : nm;
    return `${lowerName(r)} → ${nm}`;
  }
  const v = model.v;
  if (model.kind === "cond") {
    if (t <= 0.001) {
      const [a, b] = v.name.split(/-\(\d[→↔]\d\)-/);
      return `${a.replace(/ozil$/, "óz")} + ${b.replace(/ozid$/, "óz")}`;
    }
    return `${v.common} · ${v.name}`;
  }
  if (model.kind === "closure" && t <= 0.001) return `${v.common.replace(/^[αβ]-/, "")} – nyílt láncú forma (a redukáló vég felnyílt${model.paper ? ", Fischer-projekcióban" : ""})`;
  return `${v.common} · ${v.name}`;
}

function polyCaption() {
  const t = st.t, r = st.rec, n = r.nres;
  if (t <= 0.001) return `<span class="phase">1.</span><b>Az első egység (a redukáló vég).</b> Innen nő a lánc: minden új egység glikozidos kötéssel kapcsolódik, és közben egy vízmolekula lép ki (kondenzáció).`;
  if (t < 0.999) {
    const k = model.progress(t);
    return `<span class="phase">${k}.</span><b>Lánchosszabbítás:</b> a ${k}. egység kapcsolódik (${n} közül). A lánc a nem redukáló vég${r.residues.some((x) => x.parent >= 0 && r.residues.filter((y) => y.parent === x.parent).length > 1) ? "ek" : ""} felé nő.`;
  }
  const bonds = quizHidden() ? "" : ` ${r.bondtext}.`;
  return `<b>${hideName(r.name)} – ${n} egységes részlet.</b>${bonds} A valódi molekula: ${r.real || "sok száz–sok ezer egység"}.`;
}

/**
 * A tippelőben válasz előtt: általános szöveg, atomszámok és nevek nélkül
 * (különben elárulná a gyűrű méretét, a kötés helyét vagy a molekula nevét).
 */
function quizCaption() {
  const t = st.t, m = model;
  if (A.on) {
    return A.t === 0
      ? "<b>Elemezd a nyílt láncú molekulát!</b> Kattints egy atomra, és add meg, melyik atom (elem, sorszám); fent a konfigurációt, a nevet és az összegképletet. Az animáció a kiértékelés után játszható le."
      : "<b>Elemezd a molekulát!</b> Kattints egy atomra, és add meg, melyik atom (elem, sorszám) és mi a szerepe; fent add meg a formáját, a nevét és az összegképletét. Az animáció a kiértékelés után játszható le.";
  }
  const lock = quizAnimLocked() ? " Az animáció a Tippelő beállításaiban ki van kapcsolva; a válasz után megnézheted." : "";
  if (st.poly) return t >= 0.999 ? `<b>Poliszacharid-részlet.</b> Melyik molekula ez?${lock}` : polyCaption();
  if (m.kind === "static") return `<b>${st.di ? "Diszacharid" : "Nyílt láncú forma"}.</b> Melyik molekula ez?`;
  if (m.kind === "cond") {
    if (t <= 0.001) return `<span class="phase">0.</span><b>Két különálló monoszacharid.</b> Indítsd el a lejátszást!`;
    if (t < 0.42) return `<span class="phase">1.</span><b>A két monoszacharid megközelíti egymást.</b>`;
    if (t < 0.7) return `<span class="phase">2.</span><b>Kondenzáció:</b> az első egység glikozidos OH-ja és a második egység egyik hidroxilcsoportjának hidrogénje vízként lép ki.`;
    if (t < 0.999) return `<span class="phase">3.</span><b>A vízmolekula eltávozik,</b> kialakul a glikozidos kötés.`;
    return `<b>Diszacharid.</b> Melyik molekula ez?${lock}`;
  }
  if (t <= 0.001) return `<span class="phase">0.</span><b>Nyílt láncú forma${m.paper ? " (Fischer-projekció)" : ""}.</b> A karbonilcsoport (C=O) szabad. Indítsd el a lejátszást!`;
  if (t < 0.999) return `<b>Gyűrűzáródás:</b> az egyik hidroxilcsoport oxigénje megtámadja a karbonil-szénatomot, majd a H átkerül, és kialakul a glikozidos OH.`;
  return `<b>Gyűrűs forma${m.paper ? " (Haworth-képlet)" : ""}.</b> Melyik molekula ez?${lock}`;
}

function caption() {
  const t = st.t, m = model, r = st.rec;
  if (quizHidden()) return quizCaption();
  if (st.poly) return polyCaption();
  if (m.kind === "static") {
    if (!st.di) return r.v.length ? "" : "Ez a molekula nem képez stabil gyűrűt; csak nyílt láncú formája létezik.";
    return "<b>Nem redukáló diszacharid.</b> Mindkét glikozidos OH a kötésben van, ezért egyik gyűrű sem nyílhat fel. Nézd meg a glikozidos kötés kialakulását!";
  }
  if (m.kind === "closure" && m.paper) return paperCaption();
  if (m.kind === "closure") {
    const v = m.v, L = m.lab;
    const a = L[v.aC], ok = L[v.rO], oa = L[v.aO];
    const keto = !st.di ? r.kind === "keto" : MONO.get(r.B).kind === "keto";
    const grp = keto ? "ketocsoport" : "aldehidcsoport";
    if (t <= 0.001) return `<span class="phase">0.</span><b>Nyílt láncú forma.</b> A ${a} ${grp} (C=O) szabad; az ${ok} hidroxilcsoportja fogja támadni. Indítsd el a lejátszást!`;
    if (t < TIMING.bond[0]) return `<span class="phase">1.</span><b>A szénlánc elfordul</b> a C–C kötések mentén, így az ${ok} oxigénje a ${a} karbonil-szénatom közelébe kerül.`;
    if (t < TIMING.hop[0]) return `<span class="phase">2.</span><b>Az ${ok} nemkötő elektronpárja megtámadja a ${a}-et:</b> új C–O kötés jön létre, a C=O kettős kötés felnyílik, a ${a} tetraéderessé válik.`;
    if (t < 0.999) return `<span class="phase">3.</span><b>A H átkerül az ${oa}-re:</b> kialakul a glikozidos OH-csoport.`;
    const name = hideName(st.di ? v.common : v.name.replace("{cfg}", st.cfg));
    let ch = !st.di && v.chair && v.chair !== "env" && v.chair !== "other" ? v.chair : "";
    if (ch && st.cfg === "L") ch = ch === "4C1" ? "1C4" : "4C1"; // a tükörképben a szék is átfordul
    const chair = ch ? ` (${ch} szék)` : "";
    return `<b>Gyűrűs forma: ${name}${chair}.</b> A gyűrűt a ${a}…${L[v.tHo[1]]} szénatomok és az ${ok} alkotja; a ${a} lett az anomer (glikozidos) szénatom.`;
  }
  // kondenzáció
  const v = m.v, N = v.N;
  const cA = m.lab[v.cond.newBond[0]], oB = m.lab[v.cond.newBond[1]];
  if (t <= 0.001) return `<span class="phase">0.</span><b>Két különálló monoszacharid.</b> Az első egység glikozidos OH-ja (${cA}) és a második egység ${oB} hidroxilcsoportja reagál majd.`;
  if (t < 0.42) return `<span class="phase">1.</span><b>A két monoszacharid megközelíti egymást.</b>`;
  if (t < 0.7) return `<span class="phase">2.</span><b>Kondenzáció:</b> a ${cA} glikozidos OH-ja és az ${oB} hidrogénje vízként lép ki; az ${oB} kötést létesít a ${cA}-gyel.`;
  if (t < 0.999) return `<span class="phase">3.</span><b>A vízmolekula eltávozik.</b> Kialakult a glikozidos kötés${quizHidden() ? "" : `: ${r.link}`}.`;
  void N;
  return `<b>Diszacharid: ${hideName(v.common)}.</b> Glikozidos kötés: ${hideName(r.link)} (${cA}–O–${m.lab[v.cond.newBond[1]].replace(/^O/, "C")}). ${r.reducing ? "A második egység glikozidos OH-ja szabad, ezért redukáló." : "Nincs szabad glikozidos OH, ezért nem redukáló."}`;
}

function paperCaption() {
  const t = st.t, m = model, r = st.rec, v = m.v, L = m.lab, T = PAPER_T;
  const a = L[v.aC], ok = L[v.rO], oa = L[v.aO], ck = L[v.tHo[1]];
  const nm = hideName(st.di ? v.common : v.name.replace("{cfg}", st.cfg));
  if (t <= 0.001) {
    return st.di
      ? `<span class="phase">0.</span><b>Az első egység Haworth-képletben, a második (redukáló vég) Fischer-projekcióban.</b> A jobbra rajzolt csoportok a Haworth-képletben lefelé kerülnek.`
      : `<span class="phase">0.</span><b>Fischer-projekció.</b> A szénlánc függőleges, a C1 felül. A jobbra rajzolt csoportok a Haworth-képletben lefelé, a balra rajzoltak felfelé kerülnek.`;
  }
  if (!st.di && t < T.rot[1]) return `<span class="phase">1.</span><b>A Fischer-projekciót 90°-kal elforgatjuk:</b> a lánc vízszintes lesz, a jobb oldali csoportok lefelé, a bal oldaliak felfelé mutatnak.`;
  if (t < T.bend[1]) return `<span class="phase">${st.di ? 1 : 2}.</span><b>A szénláncot gyűrűvé hajlítjuk;</b> a csoportok megtartják a fent/lent állásukat.`;
  if (t < T.twist[1]) {
    const n = st.di ? 2 : 3;
    if (!m.twisted) return `<span class="phase">${n}.</span><b>Az ${ok} a gyűrűbe kerül.</b>`;
    const fic = (v.g.ficak || []).length ? ", a ficak pedig kiáll a gyűrűből" : "";
    return `<span class="phase">${n}.</span><b>Elfordulás a ${ck} körül:</b> az ${ok} a gyűrűbe kerül${fic}.`;
  }
  if (t < T.hop[0]) return `<span class="phase">${st.di ? 3 : 4}.</span><b>Az ${ok} és a ${a} között kötés alakul ki,</b> a C=O kettős kötés felnyílik.`;
  if (t < 0.999) return `<span class="phase">${st.di ? 4 : 5}.</span><b>A H átkerül az ${oa}-re:</b> kialakul a glikozidos OH-csoport.`;
  return `<b>Haworth-képlet: ${nm}.</b> A gyűrű lapított sokszög a papír síkjában, a csoportok függőleges vonalakon fel vagy le állnak. Kapcsold be a hologramot a valódi térbeli alakhoz!`;
}

// Lejátszás közben minden képkockánál frissül a szöveg: csak akkor írjuk át a
// DOM-ot, ha tényleg változott (különben a böngésző feleslegesen újrarendez).
function setHTML(el, html) {
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}
function setText(el, text) {
  if (el._text !== text) { el.textContent = text; el._text = text; }
}

function updateDynamicUI() {
  setText($("#stateName"), stateName());
  const r = st.rec;
  const chips = [`<span class="chip mono">${r.formula}</span>`, `<span class="chip">${fmtMass(r.mass)}</span>`];
  if (st.poly) {
    chips[1] = `<span class="chip">${r.nres} egység</span>`;
    for (const l of r.links) chips.push(`<span class="chip bond"><i class="dot" style="background:${S.colors.bridge}"></i>${l}</span>`);
    setText($("#bondLine"), r.bondtext);
  }
  if (st.di) {
    const bi = bondInfo(r);
    chips.push(`<span class="chip bond" title="${bi.long}"><i class="dot" style="background:${S.colors.bridge}"></i>${bi.short}</span>`);
    setText($("#bondLine"), bi.long);
  }
  $("#bondLine").hidden = !st.di && !st.poly;
  const red = reducingInfo(r);
  chips.push(`<span class="chip red" title="${red.tip}">${red.text}</span>`);
  setHTML($("#chips"), chips.join(""));
  setHTML($("#caption"), caption());
  $("#scrub").value = String(Math.round(st.t * 1000));
  $("#btnStart").classList.toggle("on", st.t <= 0.001 && hasTimeline());
  $("#btnEnd").classList.toggle("on", st.t >= 0.999 && hasTimeline());
  $(".i-play").toggleAttribute("hidden", st.playing);
  $(".i-pause").toggleAttribute("hidden", !st.playing);
  $("#btnPlay").setAttribute("aria-label", st.playing ? "Szünet" : "Lejátszás");
  // jelmagyarázat
  const leg = [];
  for (const g of GROUPS) {
    if (anaMasked() || !model.present.has(g.key) || !S.hl[g.key] || !S.vis[g.key]) continue;
    if (g.key === "glyc" && model.kind === "cond" && !model.v.g.glyc.length && st.t >= 0.98) continue;
    leg.push(`<span><i class="dot" style="background:${S.colors[g.key]}"></i>${g.name}</span>`);
  }
  setHTML($("#legend"), leg.join(""));
  // Haworth-térállás (gyűrűs monoszacharid)
  const rel = [];
  // (a tippelőben válasz előtt nem látszik: elárulná az anomert)
  if (!st.di && model.kind === "closure" && st.t >= 0.999 && !quizHidden()) {
    const v = model.v;
    let cy = 0;
    for (const i of v.ringIdx) cy += P[3 * i + 1];
    cy /= v.ringIdx.length;
    const side = (i) => (P[3 * i + 1] > cy ? "fent" : "lent");
    const arrow = (s) => (s === "fent" ? "↑" : "↓");
    const g = side(v.aO);
    rel.push(`<span><i class="dot" style="background:${S.colors.glyc}"></i>Glikozidos OH ${arrow(g)} ${g}</span>`);
    const fC = (v.g.ficak || []).find((i) => model.el[i] === "C" && model.bb[i]);
    if (fC !== undefined) {
      const f = side(fC);
      rel.push(`<span><i class="dot" style="background:${S.colors.ficak}"></i>Ficak ${arrow(f)} ${f}</span>`);
      rel.push(`<span class="verdict">${f === g ? "Azonos oldalon (cisz)" : "Ellentétes oldalon (transz)"}</span>`);
    }
    const kC = (v.g.kamu || []).find((i) => model.el[i] === "C" && model.bb[i]);
    if (kC !== undefined) {
      const kk = side(kC);
      rel.push(`<span><i class="dot" style="background:${S.colors.kamu}"></i>Kamuficak ${arrow(kk)} ${kk}</span>`);
    }
  }
  setHTML($("#rel"), rel.join(""));
}

// ---- egérmutató alatti atom -----------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = $("#tooltip");
let pointerDown = false;
let downPt = null;
canvas.addEventListener("pointerdown", (e) => { pointerDown = true; tip.hidden = true; downPt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
window.addEventListener("pointerup", () => { pointerDown = false; });
/** Az adott képernyőpont alatti atom sorszáma (vagy null). */
function atomAtPoint(x, y) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return mainLayer.atomAt(ray);
}
// analizáló: egy atomra kattintva (húzás nélkül) feljön a feliratozó menü
canvas.addEventListener("pointerup", (e) => {
  const d = downPt;
  downPt = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 700) return;
  if (NY.on) {
    // nyomda: „kiválasztott atomok” feliratozásnál kattintással ki/be
    if (SH.print.labels !== "pick") return;
    const i = atomAtPoint(e.clientX, e.clientY);
    if (i === null) return;
    if (NY.picks.has(i)) NY.picks.delete(i);
    else NY.picks.add(i);
    changed();
    return;
  }
  if (!A.on) return;
  const i = atomAtPoint(e.clientX, e.clientY);
  if (i === null) { closeAnaPop(); return; }
  if (A.done) {
    // kiértékelés után (érintőképernyőn is) megmutatja, mi az atom
    const rect = canvas.getBoundingClientRect();
    tip.innerHTML = atomInfo(i);
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - rect.left + 14, rect.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.min(e.clientY - rect.top + 14, rect.height - tip.offsetHeight - 8)}px`;
    return;
  }
  if (anaState(i) === "need") openAnaPop(i, e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
canvas.addEventListener("pointermove", (e) => {
  if (pointerDown || e.pointerType === "touch") return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const i = mainLayer.atomAt(ray);
  if (i === null) { tip.hidden = true; return; }
  tip.innerHTML = anaMasked() ? anaTip(i) : atomInfo(i);
  tip.hidden = false;
  const x = e.clientX - rect.left + 14, y = e.clientY - rect.top + 14;
  tip.style.left = `${Math.min(x, rect.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(y, rect.height - tip.offsetHeight - 8)}px`;
});
const EL_NAME = { C: "szén", O: "oxigén", H: "hidrogén", N: "nitrogén", S: "kén" };
function atomInfo(i) {
  const m = model;
  let lab = m.lab[i];
  if (m.el[i] === "H" || !lab) {
    // a kötött nehézatom az adott pillanatban
    let host = null, best = 0;
    for (const b of m.bonds) {
      if (b.i !== i && b.j !== i) continue;
      const a = b.alpha(st.t);
      if (a > best) { best = a; host = b.i === i ? b.j : b.i; }
    }
    lab = host !== null && m.lab[host] ? `${m.el[i]} · ${m.lab[host]}-hez kötve` : m.el[i] === "H" ? "H" : m.el[i];
  }
  const g = m.groupOf[i];
  const unitNo = st.poly ? ` · ${st.rec.resi[i] + 1}. egység` : "";
  return `<b>${lab}</b> · ${EL_NAME[m.el[i]]}${g ? ` · ${GROUP[g].name}` : ""}${unitNo}`;
}

// ---- fő ciklus ---------------------------------------------------------------
let needRender = true;
const DURATION = { closure: 7, paper: 9, cond: 7.5, poly: 9 };
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.playing && hasTimeline()) {
    st.t += (dt * S.speed) / DURATION[st.poly ? "poly" : model.kind === "cond" ? "cond" : model.paper ? "paper" : "closure"];
    if (st.t >= 1) { st.t = 1; st.playing = false; }
    dirty = true;
  }
  // csak akkor rajzolunk újra, ha valami változott (kíméli a telefon akkuját)
  const moved = controls.update();
  if (dirty) {
    renderFrame();
    updateDynamicUI();
    dirty = false;
    needRender = true;
  }
  if (needRender || moved || controls.autoRotate) {
    renderer.render(scene, camera);
    updateLabels();
    if (NY.on) updatePrintPreview(); // a nyomdában a vektoros kép látszik
    needRender = false;
  }
  requestAnimationFrame(loop);
}

// ---- görgetésvédelem ---------------------------------------------------------------
// Az oldal egyetlen képernyőt kitöltő alkalmazás: maga a dokumentum sosem görgethető.
// (Korábban egy kapcsoló fókusza elgörgette, és a böngésző újratöltéskor ezt visszaállította.)
try { history.scrollRestoration = "manual"; } catch { /* régi böngésző */ }
function resetScroll() {
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  const se = document.scrollingElement;
  if (se && (se.scrollTop || se.scrollLeft)) { se.scrollTop = 0; se.scrollLeft = 0; }
}
window.addEventListener("scroll", resetScroll, { passive: true });

// ---- felugró ablakok ---------------------------------------------------------------
let lastFocus = null;
function showModal(id, focusEl) {
  lastFocus = document.activeElement;
  $(id).hidden = false;
  (focusEl || $(id).querySelector("input, button, a"))?.focus({ preventScroll: true });
}
function hideModal(id) {
  $(id).hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
function closeIntro() {
  SH.introHidden = $("#introHide").checked;
  save();
  hideModal("#introBg");
}
// Beváltható kódok. A forrásban csak a kód ujjlenyomata (hash) szerepel, maga a kód nem:
// codeHash("KOD") → { msg, apply(), repeatable?, active?(), activeMsg? }
function codeHash(code) { // cyrb53
  const str = `szh-kod:${code}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const CODES = {
  // tanár mód: a Nyomda és a jó válaszok narancssárga jelölése
  "1chgqvt008s": {
    repeatable: true,
    active: () => !!SH.teach,
    activeMsg: "A tanár mód már be van kapcsolva. A Nyomda a Nézegető és a Tippelő között van.",
    msg: "Tanár mód bekapcsolva: a Nézegető és a Tippelő között megjelent a Nyomda, a Tippelőben és az Analizálóban pedig narancssárga jelöli a jó válaszokat.",
    apply() { SH.teach = true; save(); applyDev(); },
  },
  // fejlesztői mód: narancs jelölés a tippelőben és a Debugger gomb
  "19p3f8csm7n": {
    repeatable: true,
    active: () => !!SH.dev,
    activeMsg: "A fejlesztői mód már be van kapcsolva. A Debugger gomb a Redeem code mellett van.",
    msg: "Fejlesztői mód bekapcsolva: a Tippelőben narancssárga keret jelzi a jó választ, a Redeem code mellett pedig megjelent a Debugger gomb.",
    apply() { SH.dev = true; save(); applyDev(); },
  },
};
function setCodeMsg(text, kind = "") {
  const el = $("#codeMsg");
  el.textContent = text;
  el.className = `code-msg ${kind}`;
}
function bindModals() {
  $("#introHide").checked = !!SH.introHidden;
  $("#introHide").addEventListener("change", (e) => { SH.introHidden = e.target.checked; save(); });
  $("#introClose").addEventListener("click", closeIntro);
  $("#introBg").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeIntro(); });
  $("#btnRedeem").addEventListener("click", () => {
    $("#codeInput").value = "";
    setCodeMsg("");
    showModal("#codeBg", $("#codeInput"));
  });
  $("#codeCancel").addEventListener("click", () => hideModal("#codeBg"));
  $("#codeBg").addEventListener("click", (e) => { if (e.target === e.currentTarget) hideModal("#codeBg"); });
  // csak az angol ábécé nagybetűi: a kisbetűket nagyra váltjuk, minden mást elhagyunk
  $("#codeInput").addEventListener("input", (e) => {
    const el = e.target, pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos).toUpperCase().replace(/[^A-Z]/g, "");
    const v = el.value.toUpperCase().replace(/[^A-Z]/g, "");
    if (v !== el.value) {
      el.value = v;
      el.setSelectionRange(before.length, before.length);
    }
    setCodeMsg("");
  });
  $("#codeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = $("#codeInput").value.toUpperCase().replace(/[^A-Z]/g, "");
    if (!code) { setCodeMsg("Írd be a kódot.", "bad"); return; }
    const h = codeHash(code), c = CODES[h];
    if (!c) { setCodeMsg("Ez a kód nem érvényes. Ellenőrizd, hogy jól írtad-e be.", "bad"); return; }
    if (c.active && c.active()) { setCodeMsg(c.activeMsg || "Ez már be van kapcsolva.", "ok"); return; }
    if (!c.repeatable && SH.codes.includes(h)) { setCodeMsg("Ezt a kódot már beváltottad ezen az eszközön.", "bad"); return; }
    if (!SH.codes.includes(h)) SH.codes.push(h);
    save();
    if (c.apply) c.apply();
    setCodeMsg(c.msg || "A kódot beváltottad.", "ok");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#comboPop").hidden) { closeCombo(); e.preventDefault(); }
    else if (!$("#aPop").hidden) { closeAnaPop(); e.preventDefault(); }
    else if (!$("#qPop").hidden) { closeQuizPop(); e.preventDefault(); }
    else if (!$("#dbgBg").hidden) { hideModal("#dbgBg"); e.preventDefault(); }
    else if (!$("#codeBg").hidden) { hideModal("#codeBg"); e.preventDefault(); }
    else if (!$("#introBg").hidden) { closeIntro(); e.preventDefault(); }
    else if ($(".side.open")) { closeDrawers(); e.preventDefault(); }
    else if (LAYOUT.focus && !e.target.closest("input, select, textarea")) { setFocus(false); e.preventDefault(); }
  });
}

// ---- nyomda (tanár mód): vektoros kép a látott nézetből ------------------------------------
// Olyan, mint a nézegető, csak nincs animáció: a nyílt vagy a gyűrűs forma állítható be, és a
// látott kép (nagyítás, elforgatás) vektoros SVG-ként menthető. A térbeli modellt a kamera
// szemszögéből síkra vetítjük: az atomok körök, a kötések vonalak; hátulról előre rajzolva a
// közelebbi rész takarja a távolabbit. A 3D-térben is ez a vektoros kép látszik.
const svgNum = (x) => (Math.round(x * 100) / 100).toString();
const svgEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pcol = new THREE.Color();
/** Lineáris színből SVG-szín; fekete-fehér módban szürke árnyalat. k < 1 sötétít (a körvonalhoz). */
function svgColor(r, g, b, k = 1) {
  if (SH.print.bw) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = g = b = y; }
  pcol.setRGB(r * k, g * k, b * k);
  return `#${pcol.getHexString()}`;
}
/** Vetítés a kamera szemszögéből: képernyőpont, mélység és nagyítás (képpont / egység). */
function makeProjector() {
  const W = Math.max(1, viewport.clientWidth), H = Math.max(1, viewport.clientHeight);
  camera.updateMatrixWorld();
  const e = camera.matrixWorldInverse.elements;
  const f = H / 2 / Math.tan((camera.fov * Math.PI) / 360);
  return {
    W, H,
    p(x, y, z) {
      const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const d = Math.max(1e-3, -(e[2] * x + e[6] * y + e[10] * z + e[14]));
      return [W / 2 + (vx * f) / d, H / 2 - (vy * f) / d, d, f / d];
    },
  };
}
/** Egy réteg (fő modell vagy hologram) elemei a példányosított hálók adataiból: pontosan az, ami a képen van. */
function layerPrims(layer, proj, out, atoms) {
  if (!layer.m || !layer.group.visible) return;
  const m = layer.m, R = RADII[S.style];
  for (const b of layer.sph) {
    for (let k = 0; k < b.n; k++) {
      const o = 16 * k, M = b.M;
      const [x, y, d, sc] = proj.p(M[o + 12], M[o + 13], M[o + 14]);
      const q = { k: "a", i: b.ids[k], x, y, d, r: M[o] * sc, c: [b.C[3 * k], b.C[3 * k + 1], b.C[3 * k + 2]], a: b.A[k] };
      out.push(q);
      if (atoms) atoms.set(q.i, q);
    }
  }
  for (const b of layer.cyl) {
    for (let k = 0; k < b.n; k++) {
      const o = 16 * k, M = b.M;
      const hx = M[o + 4] / 2, hy = M[o + 5] / 2, hz = M[o + 6] / 2, L = 2 * Math.hypot(hx, hy, hz);
      const cx = M[o + 12], cy = M[o + 13], cz = M[o + 14];
      const r = Math.hypot(M[o], M[o + 1], M[o + 2]);
      // a kötésfél az atom felőli végén a gömb széléig tart (ne fusson rá a gömbre)
      const ra = S.style === "sf" ? 0 : (R[m.el[b.atom[k]]] || R.C) * 0.92;
      const cut = Math.min(0.95, ra / Math.max(L, 1e-6));
      let t1 = 0, t2 = 1;
      if (b.side[k] === 0) t1 = cut; else t2 = 1 - cut;
      if (t2 - t1 < 0.02) continue;
      const at = (t) => [cx - hx + 2 * hx * t, cy - hy + 2 * hy * t, cz - hz + 2 * hz * t];
      const p1 = proj.p(...at(t1)), p2 = proj.p(...at(t2)), pm = proj.p(...at((t1 + t2) / 2));
      out.push({ k: "b", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], d: pm[2], w: 2 * r * pm[3], c: [b.C[3 * k], b.C[3 * k + 1], b.C[3 * k + 2]], a: b.A[k] });
    }
  }
  for (const mesh of layer.rings) {
    if (!mesh.visible) continue;
    const pos = mesh.geometry.attributes.position, pts = [];
    for (let j = 1; j < pos.count; j++) pts.push(proj.p(pos.getX(j), pos.getY(j), pos.getZ(j)));
    const c0 = proj.p(pos.getX(0), pos.getY(0), pos.getZ(0));
    pcol.set(ringFillColor());
    out.push({ k: "r", pts, d: c0[2] + 0.5, c: [pcol.r, pcol.g, pcol.b], a: mesh.material.opacity });
  }
}
function primSVG(q) {
  const P = SH.print, hollow = P.fill === "hollow";
  const op = q.a < 0.995 ? ` opacity="${svgNum(q.a)}"` : "";
  const dark = (c) => (P.blackOutline ? "#000000" : svgColor(c[0], c[1], c[2], 0.35));
  // a nagyon világos (pl. fehér H) elem teli módban is kap egy vékony szegélyt, hogy fehér lapon is látsszon
  const light = 0.2126 * q.c[0] + 0.7152 * q.c[1] + 0.0722 * q.c[2] > 0.6;
  if (q.k === "a") {
    const fill = svgColor(...q.c);
    if (!hollow && light) {
      const sw = Math.max(0.6, q.r * 0.07);
      return `<circle cx="${svgNum(q.x)}" cy="${svgNum(q.y)}" r="${svgNum(Math.max(0.3, q.r - sw / 2))}" fill="${fill}" stroke="${svgColor(q.c[0], q.c[1], q.c[2], 0.55)}" stroke-width="${svgNum(sw)}"${op}/>`;
    }
    if (!hollow) return `<circle cx="${svgNum(q.x)}" cy="${svgNum(q.y)}" r="${svgNum(q.r)}" fill="${fill}"${op}/>`;
    // üreges: a belső rész a megadott szín, a körvonal ennek sötétebb változata (vagy fekete)
    const sw = Math.max(0.8, q.r * 0.16);
    return `<circle cx="${svgNum(q.x)}" cy="${svgNum(q.y)}" r="${svgNum(Math.max(0.3, q.r - sw / 2))}" fill="${fill}" stroke="${dark(q.c)}" stroke-width="${svgNum(sw)}"${op}/>`;
  }
  if (q.k === "b") {
    const col = svgColor(...q.c), xy = `x1="${svgNum(q.x1)}" y1="${svgNum(q.y1)}" x2="${svgNum(q.x2)}" y2="${svgNum(q.y2)}"`;
    if (!hollow && light) {
      const ow = Math.max(0.5, q.w * 0.12);
      return `<g${op}><line ${xy} stroke="${svgColor(q.c[0], q.c[1], q.c[2], 0.55)}" stroke-width="${svgNum(q.w)}"/><line ${xy} stroke="${col}" stroke-width="${svgNum(Math.max(0.4, q.w - 2 * ow))}"/></g>`;
    }
    if (!hollow) return `<line ${xy} stroke="${col}" stroke-width="${svgNum(q.w)}"${op}/>`;
    const ow = Math.max(0.7, q.w * 0.2);
    return `<g${op}><line ${xy} stroke="${dark(q.c)}" stroke-width="${svgNum(q.w)}"/><line ${xy} stroke="${col}" stroke-width="${svgNum(Math.max(0.4, q.w - 2 * ow))}"/></g>`;
  }
  const pts = q.pts.map((p) => `${svgNum(p[0])},${svgNum(p[1])}`).join(" ");
  return `<polygon points="${pts}" fill="${svgColor(...q.c)}" fill-opacity="${svgNum(q.a)}"/>`;
}
/** Mely atomok kapjanak feliratot, és mi legyen a szövegük. */
function printLabels(atoms) {
  const P = SH.print, m = model, out = [];
  if (P.labels === "none" || !m) return out;
  const t = st.t;
  // a szerep ott látszik, ahol a színezés is (nyílt láncon csak a „Kiemelés a nyílt láncon is” mellett)
  const rolesNow = P.roles && !(m.kind === "closure" && !S.hlOpen && t < 0.5);
  const role = (i) => (rolesNow && m.groupOf[i] ? ` · ${ROLE_SHORT[m.groupOf[i]]}` : "");
  if (P.labels === "carbons") {
    // mint a nézegetőben: a szénlánc számozása, a gyűrű-O és a glikozidos kötés
    for (const L of labelEls) {
      const q = atoms.get(L.i);
      if (!q || L.ana || mainLayer.alpha[L.i] < 0.3) continue;
      if (L.link && (L.gate !== undefined ? mainLayer.alpha[L.gate] < 0.6 : t < 0.6)) continue;
      out.push({ q, text: L.link ? L.el.textContent : L.el.textContent + role(L.i), link: !!L.link });
    }
    return out;
  }
  for (const [i, q] of atoms) {
    if (mainLayer.alpha[i] < 0.3) continue;
    const el = m.el[i];
    if (P.labels === "heavy" && el === "H") continue;
    if (P.labels === "pick" && !NY.picks.has(i)) continue;
    let lab = m.lab[i];
    if (el === "H" || !lab) {
      // a H a hozzá kötött atom számát kapja (az adott pillanatban)
      let host = null, best = 0;
      for (const b of m.bonds) {
        if (b.i !== i && b.j !== i) continue;
        const a = b.alpha(t);
        if (a > best) { best = a; host = b.i === i ? b.j : b.i; }
      }
      const mm = el === "H" && host !== null ? /(\d+)(′?)/.exec(m.lab[host] || "") : null;
      lab = mm ? `H${mm[1]}${mm[2]}` : el;
    }
    out.push({ q, text: lab + role(i) });
  }
  return out;
}
/** A látott kép vektorosan (SVG). Előnézetben nem vág körbe, csak keretet rajzol a vágás helyére. */
function buildSVG(preview = false) {
  const proj = makeProjector(), { W, H } = proj, P = SH.print;
  const main = [], holo = [], atoms = new Map();
  layerPrims(mainLayer, proj, main, atoms);
  if (S.holo && !A.on && holoLayer.group.visible) layerPrims(holoLayer, proj, holo, null);
  main.sort((a, b) => b.d - a.d);
  holo.sort((a, b) => b.d - a.d);
  const fs = Math.max(10, Math.min(16, Math.round(Math.min(W, H) / 48)));
  const title = st.rec ? `${st.rec.name} – ${stateName()}` : "Szénhidrát 3D";
  const labs = printLabels(atoms);
  // a kép kerete: a látott terület, vagy (ha kérik) a rajz köré vágva
  let vx = 0, vy = 0, vw = W, vh = H;
  if (P.crop) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (ax, ay, bx = ax, by = ay) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
    for (const q of [...main, ...holo]) {
      if (q.k === "a") grow(q.x - q.r, q.y - q.r, q.x + q.r, q.y + q.r);
      else if (q.k === "b") { grow(q.x1 - q.w / 2, q.y1 - q.w / 2, q.x1 + q.w / 2, q.y1 + q.w / 2); grow(q.x2 - q.w / 2, q.y2 - q.w / 2, q.x2 + q.w / 2, q.y2 + q.w / 2); }
      else for (const p of q.pts) grow(p[0], p[1]);
    }
    for (const { q, text } of labs) {
      const x = q.x + q.r * 0.72 + 2, y = q.y - q.r * 0.72 - 2;
      grow(x, y - fs, x + fs * 0.6 * text.length, y + fs * 0.3);
    }
    if (x1 > x0) {
      const pad = 12;
      vx = Math.floor(x0 - pad); vy = Math.floor(y0 - pad);
      vw = Math.ceil(x1 - x0 + 2 * pad); vh = Math.ceil(y1 - y0 + 2 * pad);
    }
  }
  const crop = preview && P.crop ? { vx, vy, vw, vh } : null;
  if (preview) { vx = 0; vy = 0; vw = W; vh = H; }
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">`, `<title>${svgEsc(title)}</title>`];
  if (P.bg !== "transparent") parts.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>`);
  parts.push(`<g stroke-linecap="butt">${main.map(primSVG).join("")}</g>`);
  if (holo.length) parts.push(`<g stroke-linecap="butt">${holo.map(primSVG).join("")}</g>`);
  if (labs.length) {
    parts.push(`<g font-family="Arial, Helvetica, sans-serif" font-size="${fs}" fill="#111111" stroke="#ffffff" stroke-width="${svgNum(fs / 4)}" stroke-linejoin="round" paint-order="stroke">`);
    for (const { q, text, link } of labs) {
      const x = q.x + q.r * 0.72 + 2, y = q.y - q.r * 0.72 - 2;
      parts.push(`<text x="${svgNum(x)}" y="${svgNum(y)}"${link ? ' font-weight="bold"' : ""}>${svgEsc(text)}</text>`);
    }
    parts.push("</g>");
  }
  if (crop) parts.push(`<rect x="${crop.vx}" y="${crop.vy}" width="${crop.vw}" height="${crop.vh}" fill="none" stroke="#1c6ccf" stroke-width="1" stroke-dasharray="6 4"/>`);
  parts.push("</svg>");
  return parts.join("");
}
/** A nyomdában a 3D-tér helyén a vektoros kép látszik (csak ha változott). */
function updatePrintPreview() {
  if (!NY.on || !model) return;
  const key = `${st.rec.id}|${st.cfg}|${st.vkey}|${st.tl}`;
  if (key !== NY.pickKey) { NY.pickKey = key; NY.picks.clear(); }
  const html = buildSVG(true);
  if (html !== NY.html) {
    NY.html = html;
    $("#printView").innerHTML = html;
  }
}
function printFileName(ext) {
  const base = norm(`${st.rec.name} ${stateName()} ${model.paper ? "2d" : "3d"}`).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "molekula"}.${ext}`;
}
function setPrintMsg(text) {
  const el = $("#printMsg");
  el.textContent = text;
  el.hidden = !text;
}
/* A claude.ai-n közzétett változat keretben fut, ahonnan közvetlenül nem lehet
   letölteni: ott a platform mentése adja át a fájlt (a néző jóváhagyásával).
   Máshol (GitHub, helyi fájl) a szokásos letöltés megy. */
let hostDownloads = null;
try {
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then((d) => {
      hostDownloads = d || null;
      // a keretből nyitott új lap nem mindig működik, a mentés viszont igen
      const open = document.getElementById("btnExportOpen");
      if (hostDownloads && open) open.hidden = true;
    }, () => {});
  }
} catch (e) { /* nincs ilyen környezet */ }
function saveFile(blob, name, hint = "") {
  if (hostDownloads) {
    hostDownloads.save({ filename: name, data: blob }).then(
      () => setPrintMsg(`Mentve: ${name}.`),
      (e) => {
        const code = (e && e.code) || "";
        setPrintMsg(code === "declined" ? "A mentés megszakítva."
          : code === "rate_limited" ? "Egy mentés már folyamatban van; próbáld újra pár másodperc múlva."
          : "Itt nem sikerült a mentés. Nyisd meg az oldalt böngészőben, és onnan mentsd.");
      });
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  setPrintMsg(`Letöltve: ${name}.${hint}`);
}
/** Mentés: letöltés, vagy megnyitás új lapon (onnan menthető). */
function exportSVG(how) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${buildSVG()}`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  if (how === "open") {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener");
    setPrintMsg(w ? "" : "A böngésző nem engedte megnyitni az új lapot; használd a Letöltés gombot.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    saveFile(blob, printFileName("svg"), " Ha nem indult el a letöltés, használd a Megnyitás új lapon gombot.");
  }
}
/** PNG is (nagy felbontásban), ha a szövegszerkesztő nem kezeli az SVG-t (pl. Google Dokumentumok). */
function exportPNG() {
  const svg = buildSVG(), k = 3;
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  const W = vb ? +vb[3] : viewport.clientWidth, H = vb ? +vb[4] : viewport.clientHeight;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = W * k;
    c.height = H * k;
    c.getContext("2d").drawImage(img, 0, 0, W * k, H * k);
    URL.revokeObjectURL(url);
    c.toBlob((blob) => {
      if (!blob) { setPrintMsg("A PNG nem készült el."); return; }
      saveFile(blob, printFileName("png"));
    }, "image/png");
  };
  img.onerror = () => { URL.revokeObjectURL(url); setPrintMsg("A PNG nem készült el."); };
  img.src = url;
}
function syncPrintSettings() {
  const P = SH.print;
  $$("#prColor button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "bw") === !!P.bw)));
  $$("#prFill button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === P.fill)));
  $$("#prBg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === P.bg)));
  $("#prBlack").checked = !!P.blackOutline;
  $("#prBlack").disabled = P.fill !== "hollow";
  $("#prBlack").closest(".toggle").classList.toggle("off", P.fill !== "hollow");
  $("#prLabels").value = P.labels;
  $("#prRoles").checked = !!P.roles;
  $("#prCrop").checked = !!P.crop;
  $("#prPickHint").hidden = P.labels !== "pick";
  $("#prTeachOff").hidden = !SH.teach;
}
function bindPrint() {
  const seg = (id, apply) => {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      apply(b.dataset.v);
      save();
      syncPrintSettings();
      changed();
    });
  };
  seg("#prColor", (v) => { SH.print.bw = v === "bw"; });
  seg("#prFill", (v) => { SH.print.fill = v; });
  seg("#prBg", (v) => { SH.print.bg = v; });
  $("#prBlack").addEventListener("change", (e) => { SH.print.blackOutline = e.target.checked; save(); changed(); });
  $("#prRoles").addEventListener("change", (e) => { SH.print.roles = e.target.checked; save(); changed(); });
  $("#prCrop").addEventListener("change", (e) => { SH.print.crop = e.target.checked; save(); changed(); });
  $("#prLabels").addEventListener("change", (e) => { SH.print.labels = e.target.value; save(); syncPrintSettings(); changed(); });
  $("#prCopyView").addEventListener("click", () => {
    SPR = clone(SV);
    if (NY.on) S = SPR;
    save(); refreshHl(); refreshElColors(); syncControls(); pickModels(); fitCamera(); updateStaticUI(); changed();
  });
  $("#prTeachOff").addEventListener("click", () => { SH.teach = false; save(); applyDev(); });
  $("#btnExport").addEventListener("click", () => exportSVG("download"));
  $("#btnExportOpen").addEventListener("click", () => exportSVG("open"));
  $("#btnExportPng").addEventListener("click", exportPNG);
  syncPrintSettings();
}

// ---- fejlesztői mód: hibakereső (Debugger) ------------------------------------------------
// A nézegetőben fut. A kijelölt csoportok molekuláin a lista sorrendjében megy végig. Minden
// molekulát a kért nézetben (3D, 2D vagy mindkettőben) megjelenít, lejátssza az animációt, majd
// a jobb oldali beállításokat fentről lefelé egyenként átállítja és visszaállítja; a színek
// vannak a végén (mindegyik narancsra, majd vissza). Két lépés között a megadott ideig vár,
// hogy szemmel is követhető legyen, és minden lépés után magától is ellenőrzi a modellt.
const DBG_ORANGE = "#ff8a00";
// a mért adatok alapján: ennél hosszabb kötés vagy közelebbi (nem kötött) nehézatomok hibának számítanak
const DBG_LIMIT = { m3: { bond: 2.0, close: 1.2 }, paper: { bond: 3.2, close: 0.5 } };
const DBG_GROUP_IDS = {
  mono: () => [3, 4, 5, 6, 7].flatMap((n) => SUBS.flatMap((sb) => DATA.monos.filter((m) => m.n === n && m.sub === sb))).map((m) => m.id),
  di: () => DIS_SORTED.map((d) => d.id),
  poly: () => POLY_GROUPS.flatMap(([g]) => POLYS.filter((p) => p.group === g)).map((p) => p.id),
};
const DBG_VIEWS = { "3d": ["3d"], paper: ["paper"], both: ["3d", "paper"] };
const getPath = (o, key) => key.split(".").reduce((x, k) => x[k], o);

/** Mi állítható egy molekulánál (az alapformája szerint): idővonalak, forma, kiemelt csoportok, elemek. */
function dbgInfo(id) {
  const r = recOf(id), k = kindOf(id);
  const I = { k, tls: [], cfg: null, ring: null, an: null, groups: [], els: ELS.filter((e) => r.el.includes(e)), rings: true };
  const present = (g) => GROUPS.map((x) => x.key).filter((x) => (g[x] || []).length);
  if (k === "poly") {
    I.tls = ["poly"];
    I.groups = present(r.g);
  } else if (k === "di") {
    const v = r.v.find((x) => x.key === r.defv) || r.v[0];
    I.tls = r.reducing ? ["closure", "cond"] : ["cond"];
    if (r.v.length > 1) I.an = v.key;
    I.groups = present(v.g);
  } else {
    const v = r.v.find((x) => x.key === r.defv) || r.v[0];
    if (r.cfg) I.cfg = r.cfg;
    if (v) {
      I.tls = ["closure"];
      if (new Set(r.v.map((x) => x.ring)).size > 1) I.ring = v.ring;
      I.an = v.an;
      I.groups = present(v.g);
    } else I.rings = false;
  }
  return I;
}
/**
 * Egy molekula egy nézetben: a lépések listája. O az eredeti beállítások másolata
 * (a visszaállítás értékei). „Lépésenként” módban minden átállítás után jön a
 * visszaállítás; „egyszerre” módban a molekula végén egyetlen lépés állít vissza mindent.
 */
function dbgPass(id, view, opt, O) {
  const I = dbgInfo(id), stepMode = opt.restore !== "end";
  const steps = [];
  const add = (o) => steps.push({ id, view, ...o });
  // egy beállítás átállítása (és lépésenkénti módban a visszaállítása); a felirat az új, ill. az eredeti értéket mutatja
  const set = (key, value, name, fmt = (v) => v) => {
    const orig = getPath(O, key);
    add({ type: "set", key, value, label: `${name}: ${fmt(value)}` });
    if (stepMode) add({ type: "set", key, value: orig, label: `${name}: ${fmt(orig)} (vissza)` });
  };
  const form = (key, value, back, name, fmt) => {
    add({ type: "form", key, value, label: `${name}: ${fmt(value)}` });
    if (stepMode) add({ type: "form", key, value: back, label: `${name}: ${fmt(back)} (vissza)` });
  };
  const onOff = (on) => (on ? "be" : "ki");
  const color = (c) => (c === DBG_ORANGE ? "narancs" : "eredeti");
  add({ type: "load", label: "megjelenítés" });
  // animáció (diszacharidnál a második idővonalon is)
  if (I.tls.length) add({ type: "anim", tl: I.tls[0], label: "animáció" });
  if (I.tls.length > 1) {
    add({ type: "tl", value: I.tls[1], label: "Glikozidos kötés kialakulása fül" });
    add({ type: "anim", tl: I.tls[1], label: "animáció (glikozidos kötés kialakulása)" });
    if (stepMode) add({ type: "tl", value: I.tls[0], label: "Gyűrűzáródás fül (vissza)" });
  }
  if (I.tls.length) set("speed", O.speed === 2 ? 1 : 2, "Sebesség", (v) => `${String(v).replace(".", ",")}×`);
  // Hologram (kihagyható): a részleteit bekapcsolt hologramon váltjuk
  if (opt.holo) {
    if (!O.holo) {
      add({ type: "set", key: "holo", value: true, label: "Hologram: be" });
    } else {
      add({ type: "set", key: "holo", value: false, label: "Hologram: ki" });
      add({ type: "set", key: "holo", value: true, label: "Hologram: be (vissza)" });
    }
    set("holoOpacity", O.holoOpacity < 45 ? 75 : 15, "Hologram átlátszósága");
    for (const p of HOLO_PARTS) {
      if ((p.key === "ficak" || p.key === "kamu") && !I.groups.includes(p.key)) continue;
      set(`holoParts.${p.key}`, !O.holoParts[p.key], `Hologram – ${p.name}`, onOff);
    }
    if (!O.holo && stepMode) add({ type: "set", key: "holo", value: false, label: "Hologram: ki (vissza)" });
  }
  // Forma
  if (I.cfg) form("cfg", I.cfg === "D" ? "L" : "D", I.cfg, "Konfiguráció", (v) => v);
  if (I.ring) form("ring", I.ring === "p" ? "f" : "p", I.ring, "Gyűrű", (v) => ({ p: "piranóz", f: "furanóz" })[v]);
  if (I.an) form("an", I.an === "a" ? "b" : "a", I.an, "Anomer", (v) => GREEK[v]);
  // Kiemelések (a színek a legvégén jönnek)
  for (const g of GROUPS) {
    if (!I.groups.includes(g.key)) continue;
    set(`hl.${g.key}`, !O.hl[g.key], `Kiemelés – ${g.name} színezése`, onOff);
    set(`vis.${g.key}`, !O.vis[g.key], `Kiemelés – ${g.name}`, (v) => (v ? "látszik" : "elrejtve"));
  }
  set("hlOpen", !O.hlOpen, "Kiemelés a nyílt láncon is", onOff);
  // Láthatóság
  set("showH", !O.showH, "H-atomok", onOff);
  set("showOH", !O.showOH, "Sima OH-csoportok", onOff);
  set("labels", !O.labels, "C-atomok számozása", onOff);
  if (I.rings) set("ringFill", !O.ringFill, "Gyűrű síkjának jelölése", onOff);
  // Megjelenítés
  const STYLE_NAME = { bs: "golyó–pálcika", st: "pálcika", sf: "kalotta" };
  for (const s of ["bs", "st", "sf"]) if (s !== O.style) set("style", s, "Modell", (v) => STYLE_NAME[v]);
  set("autoRotate", !O.autoRotate, "Automatikus forgatás", onOff);
  // Színek: mindegyik narancsra, majd vissza
  for (const g of GROUPS) if (I.groups.includes(g.key)) set(`colors.${g.key}`, DBG_ORANGE, `Szín – ${g.name}`, color);
  for (const e of I.els) set(`el.${e}`, DBG_ORANGE, `Atomszín – ${e}`, color);
  if (!stepMode) add({ type: "restoreAll", label: "minden beállítás visszaállítása" });
  return steps;
}
function debugPlan(opt, O = SV) {
  const steps = [];
  for (const g of ["mono", "di", "poly"]) {
    if (!opt.groups[g]) continue;
    for (const id of DBG_GROUP_IDS[g]()) {
      for (const view of DBG_VIEWS[opt.views] || DBG_VIEWS.both) steps.push(...dbgPass(id, view, opt, O));
    }
  }
  return steps;
}
const DBG_ANIM_SEC = (s, tl) => DURATION[tl === "poly" ? "poly" : tl === "cond" ? "cond" : s.view === "paper" ? "paper" : "closure"];
function fmtDuration(sec) {
  if (sec < 90) return `${Math.round(sec)} másodperc`;
  const min = Math.round(sec / 60);
  return min < 90 ? `${min} perc` : `${Math.floor(min / 60)} óra ${min % 60} perc`;
}
function stepLabel(s) {
  return `${recOf(s.id).name} · ${s.view === "paper" ? "2D" : "3D"} · ${s.label}`;
}
/** Egy beállítás értékének átírása, és ami ezzel jár (színek, kamera, kezelőszervek). */
function dbgSet(key, value) {
  const parts = key.split(".");
  const wasSf = S.style === "sf";
  if (parts.length === 2) S[parts[0]][parts[1]] = value;
  else S[key] = value;
  if (parts[0] === "colors") refreshHl();
  if (parts[0] === "el") refreshElColors();
  if (key === "style" && wasSf !== (S.style === "sf")) fitCamera();
  syncControls();
  updateStaticUI();
  changed();
}
/** A molekula formájának váltása (D/L, gyűrű, anomer), mint a Forma résznél. */
function dbgForm(key, value) {
  const r = st.rec;
  if (key === "cfg") st.cfg = value;
  else if (st.di) st.vkey = value;
  else {
    const [ring, an] = (st.vkey || "p-a").split("-");
    const want = key === "ring" ? `${value}-${an}` : `${ring}-${value}`;
    const v = r.v.find((x) => x.key === want) || r.v.find((x) => (key === "ring" ? x.ring === value : x.an === value));
    if (v) st.vkey = v.key;
  }
  st.playing = false;
  rebuild(false);
}
/** Az eredeti beállítások visszaírása (a nézet kivételével, az a futás nézete marad). */
function dbgRestoreSettings(O, view) {
  for (const k of Object.keys(O)) SV[k] = clone(O[k]);
  if (view) SV.view = view;
  refreshHl();
  refreshElColors();
  syncControls();
}
function applyDebugStep(s, O, form0) {
  st.playing = false;
  switch (s.type) {
    case "load":
      dbgRestoreSettings(O, s.view);
      load(s.id);
      form0.cfg = st.cfg; form0.vkey = st.vkey; form0.tl = st.tl;
      syncControls();
      break;
    case "anim":
      if (hasTimeline()) { st.t = 0; st.playing = true; changed(); }
      break;
    case "tl":
      st.tl = s.value;
      st.t = 1;
      rebuild(true);
      break;
    case "set":
      dbgSet(s.key, s.value);
      break;
    case "form":
      dbgForm(s.key, s.value);
      break;
    case "restoreAll": {
      dbgRestoreSettings(O, s.view);
      const formChanged = st.cfg !== form0.cfg || st.vkey !== form0.vkey || st.tl !== form0.tl;
      st.cfg = form0.cfg; st.vkey = form0.vkey; st.tl = form0.tl;
      if (formChanged) { st.t = 1; rebuild(true); } else { updateStaticUI(); changed(); }
      break;
    }
  }
}
/** Automatikus ellenőrzés: érvénytelen koordináta, megnyúlt kötés, egymásba lógó atomok. */
function debugCheck() {
  const out = [];
  const bad = (X) => { for (let i = 0; i < X.length; i++) if (!Number.isFinite(X[i])) return true; return false; };
  if (!P || bad(P)) out.push("érvénytelen (NaN) koordináta a modellben");
  if (S.view === "paper" && !model.paper) out.push("nem készült el a papírmodell (2D)");
  if (S.holo) {
    if (!holoModel) out.push("nem készült el a hologram");
    else if (!HP || bad(HP)) out.push("érvénytelen koordináta a hologramban");
  }
  const t = st.t, m = model;
  if (!P || (t > 0.001 && t < 0.999)) return out;
  const lim = m.paper ? DBG_LIMIT.paper : DBG_LIMIT.m3;
  const name = (i) => m.lab[i] || m.el[i];
  const bonded = new Set();
  let worst = 0, wb = null;
  for (const b of m.bonds) {
    bonded.add(b.i < b.j ? b.i * 100000 + b.j : b.j * 100000 + b.i);
    if (b.alpha(t) < 0.9 || m.atomAlpha(t, b.i) < 0.9 || m.atomAlpha(t, b.j) < 0.9) continue;
    const d = Math.hypot(P[3 * b.i] - P[3 * b.j], P[3 * b.i + 1] - P[3 * b.j + 1], P[3 * b.i + 2] - P[3 * b.j + 2]);
    if (d > worst) { worst = d; wb = b; }
  }
  if (worst > lim.bond) out.push(`megnyúlt kötés: ${name(wb.i)}–${name(wb.j)} (${worst.toFixed(2)} Å)`);
  const heavy = [];
  for (let i = 0; i < m.N; i++) if (m.el[i] !== "H" && m.atomAlpha(t, i) >= 0.9) heavy.push(i);
  let close = Infinity, pair = null;
  for (let a = 0; a < heavy.length; a++) {
    const i = heavy[a];
    for (let b = a + 1; b < heavy.length; b++) {
      const j = heavy[b];
      const d = Math.hypot(P[3 * i] - P[3 * j], P[3 * i + 1] - P[3 * j + 1], P[3 * i + 2] - P[3 * j + 2]);
      if (d < close && !bonded.has(i * 100000 + j)) { close = d; pair = [i, j]; }
    }
  }
  if (close < lim.close) out.push(`egymásba lógó atomok: ${name(pair[0])} és ${name(pair[1])} (${close.toFixed(2)} Å)`);
  return out;
}
/** Várakozás, ami leálláskor azonnal véget ér. */
function dbgSleep(ms) {
  return new Promise((res) => {
    const end = performance.now() + ms;
    const tick = () => {
      if (DBG.stop || performance.now() >= end) res();
      else setTimeout(tick, Math.min(100, end - performance.now()));
    };
    tick();
  });
}
/** Megvárja, hogy a kép kirajzolódjon (háttérben futó lapon legfeljebb 250 ms-ig). */
const dbgFrame = () => new Promise((res) => {
  let done = false;
  const fin = () => { if (!done) { done = true; res(); } };
  requestAnimationFrame(() => requestAnimationFrame(fin));
  setTimeout(fin, 250);
});
async function runDebug() {
  if (DBG.running) return;
  const mode = currentMode();
  if (mode !== "view") setMode("view"); // a hibakereső a nézegetőben fut
  const O = clone(SV);
  const opt = clone(SH.dbg);
  const plan = debugPlan(opt, O);
  if (!plan.length) return;
  DBG.saved = { mode, O, id: st.rec.id, cfg: st.cfg, vkey: st.vkey, tl: st.tl, t: st.t };
  Object.assign(DBG, { running: true, stop: false, i: 0, total: plan.length, issues: [], slow: null, cur: null, done: null });
  closeDrawers();
  hideModal("#dbgBg");
  syncDebugUI();
  const wait = Math.min(60, Math.max(0.1, +opt.sec || 1)) * 1000;
  const form0 = {};
  for (const step of plan) {
    if (DBG.stop) break;
    DBG.cur = step;
    const t0 = performance.now();
    applyDebugStep(step, O, form0);
    renderFrame();
    const dt = performance.now() - t0;
    if (!DBG.slow || dt > DBG.slow.ms) DBG.slow = { ms: dt, label: stepLabel(step) };
    updateDebugProgress();
    await dbgFrame();
    if (step.type === "anim" && st.playing) {
      // lejátszás nyílttól zártig; az ellenőrzés a végállapoton
      const limit = performance.now() + (DBG_ANIM_SEC(step, st.tl) / (S.speed || 1) + 3) * 1000;
      while (st.playing && !DBG.stop && performance.now() < limit) await dbgSleep(100);
      st.playing = false;
      st.t = 1;
      changed();
      renderFrame();
    }
    for (const msg of debugCheck()) DBG.issues.push(`${stepLabel(step)}: ${msg}`);
    updateDebugProgress();
    await dbgSleep(wait);
    if (!DBG.stop) DBG.i++;
  }
  finishDebug();
}
function stopDebug() {
  if (DBG.running) DBG.stop = true;
}
/** A futás vége: minden beállítás és a kiinduló molekula visszaáll, megjelenik az összegzés. */
function finishDebug() {
  const stopped = DBG.stop;
  DBG.running = false;
  DBG.stop = false;
  st.playing = false;
  const sv = DBG.saved;
  dbgRestoreSettings(sv.O);
  st.rec = recOf(sv.id);
  st.di = DI.has(sv.id);
  st.poly = POLY.has(sv.id);
  st.cfg = sv.cfg;
  st.vkey = sv.vkey;
  st.tl = sv.tl;
  st.t = sv.t;
  rebuild(true);
  markCurrent();
  syncControls();
  if (sv.mode !== "view") setMode(sv.mode);
  DBG.done = { stopped, i: DBG.i, total: DBG.total };
  save();
  syncDebugUI();
  showModal("#dbgBg", $("#dbgClose"));
}
function updateDebugProgress() {
  const s = DBG.cur;
  const label = s ? stepLabel(s) : "";
  const issues = DBG.issues.length ? ` · ${DBG.issues.length} hiba` : "";
  $("#dbgBarText").textContent = `Debugger ${Math.min(DBG.i + 1, DBG.total)}/${DBG.total}${issues} · ${label}`;
  $("#dbgBarText").title = label;
  if (!$("#dbgBg").hidden) syncDebugUI();
}
function syncDebugUI() {
  const d = SH.dbg, running = DBG.running;
  $("#btnDebug").hidden = !SH.dev;
  $("#btnDebug").classList.toggle("running", running);
  $("#dbgBar").hidden = !running;
  $$("#segMode button").forEach((b) => { b.disabled = running; });
  $("#dbgSetup").hidden = running;
  $("#dbgOff").hidden = running;
  $("#dbgRun").textContent = running ? "Leállítás" : "Futtatás";
  if (document.activeElement !== $("#dbgSec")) $("#dbgSec").value = String(d.sec).replace(".", ",");
  for (const g of ["mono", "di", "poly"]) $(`#dbg${g[0].toUpperCase()}${g.slice(1)}`).checked = !!d.groups[g];
  $("#dbgMonoT").textContent = `Monoszacharidok (${DATA.monos.length})`;
  $("#dbgDiT").textContent = `Diszacharidok (${DATA.dis.length})`;
  $("#dbgPolyT").textContent = `Poliszacharidok (${POLYS.length})`;
  $$("#dbgViews button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (d.views || "both"))));
  $$("#dbgRestore button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (d.restore || "step"))));
  $("#dbgHolo").checked = d.holo !== false;
  const plan = debugPlan(d);
  const sec = Math.min(60, Math.max(0.1, +d.sec || 1));
  const animTime = plan.filter((s) => s.type === "anim").reduce((a, s) => a + DBG_ANIM_SEC(s, s.tl) / (SV.speed || 1), 0);
  const mols = plan.filter((s) => s.type === "load").length;
  $("#dbgPlan").textContent = `${mols} megjelenítés, összesen ${plan.length} lépés, kb. ${fmtDuration(plan.length * sec + animTime)}. ` +
    "Futás közben a Debugger gombbal vagy a 3D-tér tetején lévő gombbal állítható le.";
  const status = running || DBG.done;
  $("#dbgStatus").hidden = !status;
  if (!status) return;
  $("#dbgProg").max = DBG.total || 1;
  $("#dbgProg").value = running ? DBG.i : DBG.done.i;
  $("#dbgNow").textContent = running
    ? `${Math.min(DBG.i + 1, DBG.total)}/${DBG.total} · ${DBG.cur ? stepLabel(DBG.cur) : ""}`
    : `${DBG.done.stopped ? "Leállítva" : "Kész"}: ${DBG.done.i}/${DBG.done.total} lépés.`;
  const n = DBG.issues.length;
  const slow = DBG.slow ? ` Leglassabb lépés: ${DBG.slow.label} (${Math.round(DBG.slow.ms)} ms).` : "";
  $("#dbgSum").innerHTML = `<b>${n ? `${n} hiba` : "Nincs hiba."}</b>${n ? " (lent a lista)." : ""}${slow.replace(/[<>&]/g, "")}`;
  const log = $("#dbgLog");
  log.hidden = !n;
  log.innerHTML = "";
  for (const msg of DBG.issues.slice(0, 200)) {
    const li = document.createElement("li");
    li.textContent = msg;
    log.appendChild(li);
  }
}
/** A fejlesztői mód ki/be kapcsolása a felületen. */
function applyDev() {
  if (!SH.dev) stopDebug();
  syncDebugUI();
  if (NY.on && !canPrint()) setMode("view");
  renderQuiz();
  if (A.on) updateAnaForm();
  applyModeUI();
  syncPrintSettings();
}
function bindDebugger() {
  $("#btnDebug").addEventListener("click", () => {
    syncDebugUI();
    showModal("#dbgBg", $("#dbgRun")); // (nem a szövegmezőre: telefonon az feldobná a billentyűzetet)
  });
  $("#dbgClose").addEventListener("click", () => hideModal("#dbgBg"));
  $("#dbgBg").addEventListener("click", (e) => { if (e.target === e.currentTarget) hideModal("#dbgBg"); });
  $("#dbgForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (DBG.running) { stopDebug(); return; }
    SH.dbg.sec = readSec();
    save();
    runDebug();
  });
  $("#dbgBarStop").addEventListener("click", stopDebug);
  // másodperc: tizedesvesszővel vagy -ponttal; 0,1 és 60 közé igazítjuk
  const readSec = () => {
    const raw = parseFloat(String($("#dbgSec").value).replace(",", ".").replace(/[^\d.]/g, ""));
    return Number.isFinite(raw) ? Math.min(60, Math.max(0.1, Math.round(raw * 10) / 10)) : SH.dbg.sec;
  };
  $("#dbgSec").addEventListener("change", () => {
    SH.dbg.sec = readSec();
    save();
    $("#dbgSec").value = String(SH.dbg.sec).replace(".", ",");
    syncDebugUI();
  });
  for (const g of ["mono", "di", "poly"]) {
    $(`#dbg${g[0].toUpperCase()}${g.slice(1)}`).addEventListener("change", (e) => {
      SH.dbg.groups[g] = e.target.checked;
      // legalább egy csoport mindig ki van jelölve
      if (!Object.values(SH.dbg.groups).some(Boolean)) SH.dbg.groups[g] = true;
      save();
      syncDebugUI();
    });
  }
  for (const [id, key] of [["#dbgViews", "views"], ["#dbgRestore", "restore"]]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      SH.dbg[key] = b.dataset.v;
      save();
      syncDebugUI();
    });
  }
  $("#dbgHolo").addEventListener("change", (e) => { SH.dbg.holo = e.target.checked; save(); syncDebugUI(); });
  $("#dbgOff").addEventListener("click", () => {
    SH.dev = false;
    save();
    applyDev();
    hideModal("#dbgBg");
  });
  syncDebugUI();
}

// ---- indulás -------------------------------------------------------------------
buildTree();
buildHlRows();
buildHoloParts();
bindControls();
bindQuizSettings();
syncQuizSettings();
bindModals();
bindQuizPop();
bindAna();
bindPrint();
bindDebugger();
bindLayout();
resetScroll();
if (!SH.introHidden) showModal("#introBg", $("#introClose"));
syncControls();
resize();
const startId = decodeURIComponent((location.hash || "").slice(1));
load(recOf(startId) ? startId : "glukoz");
renderQuiz();
if (startId === "tippelo") setMode("quiz");
else if (startId === "analizalo") setMode("ana");
else if (startId === "nyomda") setMode("print");
window.addEventListener("hashchange", () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id === "tippelo") setMode("quiz");
  else if (id === "analizalo") setMode("ana");
  else if (id === "nyomda") setMode("print");
  else if (recOf(id) && (Q.on || A.on || id !== st.rec.id)) { if (!NY.on) setMode("view"); select(id); }
});
requestAnimationFrame(loop);
