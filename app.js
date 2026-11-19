// Szénhidrát 3D – megjelenítés és kezelőfelület
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeClosure, makeCondensation, makeStatic, smooth, TIMING } from "./kinematics.js";
import {
  makePaperClosure, makePaperClosureDi, makePaperDiStatic, makePaperFischer, paperCondensationInput,
  alignOnto, PAPER_T,
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
const CLS = { 3: "Triózok", 4: "Tetrózok", 5: "Pentózok", 6: "Hexózok", 7: "Heptózok" };
const CLS1 = { 3: "Trióz", 4: "Tetróz", 5: "Pentóz", 6: "Hexóz", 7: "Heptóz" };
const SUBS = ["aldo", "keto", "dezoxi", "amino", "uron"];
const SUB = { aldo: "Aldózok", keto: "Ketózok", dezoxi: "Dezoxicukrok", amino: "Aminocukrok", uron: "Uronsavak" };
const SUB1 = { aldo: "aldóz", keto: "ketóz", dezoxi: "dezoxicukor", amino: "aminocukor", uron: "uronsav" };
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
const subNum = (n) => String(n).replace(/\d/g, (d) => SUBSCRIPT[d]);
const GREEK = { a: "α", b: "β" };

const GROUPS = [
  { key: "glyc", name: "Glikozidos OH", hint: "az anomer C-atom OH-csoportja", color: "#f2b705" },
  { key: "ringO", name: "Gyűrű-O", hint: "a glikozidos OH melletti gyűrű-oxigén", color: "#ec3f9f" },
  { key: "ficak", name: "Ficak", hint: "a gyűrű-O túloldalán kiálló C-ág (pl. –CH₂OH)", color: "#1fb35b" },
  { key: "kamu", name: "Kamuficak", hint: "ketózoknál az anomer C-atom –CH₂OH-ja", color: "#14b4cc" },
  { key: "bridge", name: "Glikozidos kötés O-ja", hint: "a két egységet összekötő oxigénhíd", color: "#7b5cff" },
];
const GROUP = Object.fromEntries(GROUPS.map((g) => [g.key, g]));
const PRIORITY = ["ficak", "kamu", "ringO", "glyc", "bridge"]; // a későbbi felülírja a korábbit
const EL_DEFAULT = { C: "#5f6877", O: "#e23b3b", H: "#eef1f5", N: "#3d6fe0" };

const RADII = {
  bs: { C: 0.3, O: 0.28, N: 0.29, H: 0.18, bond: 0.085, dbl: 0.06, off: 0.075 },
  st: { C: 0.13, O: 0.13, N: 0.13, H: 0.1, bond: 0.13, dbl: 0.07, off: 0.1 },
  sf: { C: 1.55, O: 1.38, N: 1.42, H: 1.0, bond: 0, dbl: 0, off: 0 },
};

// ---------------------------------------------------------------------------
//  Beállítások (böngészőben megjegyezve)
// ---------------------------------------------------------------------------
const STORE = "szenhidrat3d.v1";
const DEFAULTS = {
  colors: Object.fromEntries(GROUPS.map((g) => [g.key, g.color])),
  hl: Object.fromEntries(GROUPS.map((g) => [g.key, true])),
  vis: Object.fromEntries(GROUPS.map((g) => [g.key, true])),
  showH: true, showOH: true, labels: true, ringFill: false, hlOpen: true,
  style: "bs", el: { ...EL_DEFAULT }, autoRotate: false, speed: 1,
  view: "3d", holo: false, holoOpacity: 32, fav: [], favFirst: false, quiz: { ok: 0, total: 0 },
  holoParts: { C: true, OH: true, H: true, ficak: true, kamu: true },
};
const HOLO_PARTS = [
  { key: "C", name: "C-váz" },
  { key: "OH", name: "OH-csoportok" },
  { key: "H", name: "H-atomok" },
  { key: "ficak", name: "Ficak" },
  { key: "kamu", name: "Kamuficak" },
];
const S = (() => {
  const base = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (raw && typeof raw === "object") {
      for (const k of Object.keys(base)) {
        if (!(k in raw)) continue;
        if (base[k] && typeof base[k] === "object") Object.assign(base[k], raw[k]);
        else base[k] = raw[k];
      }
    }
  } catch { /* nincs tárolás */ }
  return base;
})();
const TOGGLES = ["showH", "showOH", "labels", "ringFill", "hlOpen", "autoRotate"];
const TOGGLE_ID = { labels: "showLabels" };
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* nincs tárolás */ } };

// ---------------------------------------------------------------------------
//  Állapot
// ---------------------------------------------------------------------------
const st = { rec: null, di: false, cfg: "D", vkey: null, tl: "closure", t: 1, playing: false };
let models = null; // { m3, mP }
let model = null; // a fő (látható) modell
let holoModel = null; // a hologramként rávetített másik modell

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

function lowerName(r) {
  if (r.id === "nacetilglukozamin") return `N-acetil-${st.cfg}-glükózamin`;
  if (r.id === "dezoxiriboz") return `2-dezoxi-${st.cfg}-ribóz`;
  if (!r.cfg) return r.name.toLowerCase();
  return `${st.cfg}-${r.name.toLowerCase()}`;
}
const unitName = (id) => (id === "nacetilglukozamin" ? "N-acetilglükózamin" : MONO.get(id).name.toLowerCase());

function carbonsOf(r) {
  const c = [];
  r.lab.forEach((l, i) => { const mm = /^C(\d+)$/.exec(l); if (mm && r.bb[i]) c[+mm[1] - 1] = i; });
  return c.filter((x) => x !== undefined);
}
function tryPaper(fn) {
  try { return fn(); } catch (e) { console.warn("A papírmodell nem készült el:", e); return null; }
}

/**
 * A kiválasztott molekulából és formából felépíti a két megjelenítendő
 * modellt: a valódi térbelit (m3) és a tankönyvi papírmodellt (mP).
 */
function buildModels() {
  const r = st.rec;
  let m3, mP = null, meta;
  if (!st.di) {
    const mirror = st.cfg === "L";
    const v = r.v.find((x) => x.key === st.vkey);
    const Xo = f64(r.open.x, mirror);
    const carbons = carbonsOf(r);
    if (!v) {
      m3 = makeStatic(Xo, r.open.b);
      meta = { el: r.el, lab: r.lab, bb: r.bb, groups: {}, ohs: r.ohs0, rings: [], kind: "static" };
      mP = tryPaper(() => makePaperFischer({ el: r.el, bo: r.open.b, X3o: Xo, carbons }));
    } else {
      const Xr = f64(v.x, mirror);
      m3 = makeClosure({ el: r.el, Xo, Xr, bo: r.open.b, br: v.b, root: v.root, tH: v.tH, tHo: v.tHo, tHr: v.tHr, aC: v.aC, ringForm: v.ringIdx });
      meta = { el: r.el, lab: r.lab, bb: r.bb, groups: v.g, ohs: v.ohs, kind: "closure", v,
        rings: [{ idx: v.ringIdx, forming: true }] };
      mP = tryPaper(() => makePaperClosure({ el: r.el, bo: r.open.b, br: v.b, X3o: Xo, X3r: Xr, ring: v.ringIdx,
        ringType: v.ring, carbons, tH: v.tH, tHo: v.tHo }));
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
      mP = tryPaper(() => {
        const ci = paperCondensationInput({ el: r.el, b: v.b, X3r: Float64Array.from(v.x), X3free: Float64Array.from(c.free),
          gBonds: c.gBonds, ...units });
        return makeCondensation({ ...ci, side: c.side, newBond: c.newBond, gBonds: c.gBonds, N, bonds: v.b });
      });
    } else if (v.open) {
      m3 = makeClosure({ el: r.el, Xo: Float64Array.from(v.open.x), Xr: Float64Array.from(v.x), bo: v.open.b, br: v.b,
        root: v.root, tH: v.tH, tHo: v.tHo, tHr: v.tHr, aC: v.aC, ringForm: v.ringB });
      meta = { el: r.el.slice(0, N), lab: r.lab.slice(0, N), bb: r.bb.slice(0, N), groups: v.g, ohs: v.ohs,
        kind: "closure", v, rings: [{ idx: v.ringA }, { idx: v.ringB, forming: true }] };
      mP = tryPaper(() => makePaperClosureDi({ el: r.el.slice(0, N), lab: r.lab, bb: r.bb, bo: v.open.b, br: v.b,
        X3o: Float64Array.from(v.open.x), X3r: Float64Array.from(v.x), tH: v.tH, tHo: v.tHo, ...units }));
    } else {
      m3 = makeStatic(Float64Array.from(v.x), v.b);
      meta = { el: r.el.slice(0, N), lab: r.lab.slice(0, N), bb: r.bb.slice(0, N), groups: v.g, ohs: v.ohs,
        kind: "static", v, rings: [{ idx: v.ringA }, { idx: v.ringB }] };
      mP = tryPaper(() => makePaperDiStatic({ el: r.el, br: v.b, X3r: Float64Array.from(v.x), ...units }));
    }
  }
  if (mP) mP.paper = true;
  for (const m of [m3, mP]) {
    if (!m) continue;
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
  }
  return { m3, mP };
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

const sphereGeo = new THREE.SphereGeometry(1, 40, 28);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 22, 1, false);
const UP = new THREE.Vector3(0, 1, 0);

function mat(holo) {
  if (holo) {
    return new THREE.MeshStandardMaterial({
      roughness: 0.25, metalness: 0.0, transparent: true, depthWrite: false, envMapIntensity: 1.2,
    });
  }
  return new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.02, envMapIntensity: 0.9 });
}
// ---- színek -----------------------------------------------------------------
const tmpC = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);
const elColor = {};
function refreshElColors() {
  for (const e of ["C", "O", "H", "N"]) elColor[e] = new THREE.Color(S.el[e] || EL_DEFAULT[e]);
}
refreshElColors();
const hlColor = {};
function refreshHl() {
  for (const g of GROUPS) hlColor[g.key] = new THREE.Color(S.colors[g.key]);
}
refreshHl();

function atomColor(m, i, k, out) {
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

function setOpacity(m, a, holo) {
  const tr = holo || a < 0.995;
  if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
  m.opacity = a;
  m.depthWrite = !holo && a > 0.6;
}
function paint(m, color, opacity, holo) {
  m.color.copy(color);
  if (holo) m.emissive.copy(color).multiplyScalar(0.38);
  setOpacity(m, opacity, holo);
}
function placeCyl(mesh, a, b, r, color, opacity, holo) {
  vD.subVectors(b, a);
  const L = vD.length();
  if (L < 1e-6 || opacity < 0.01 || r <= 0) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, vD.multiplyScalar(1 / L));
  mesh.scale.set(r, L, r);
  paint(mesh.material, color, opacity, holo);
}

/** Egy modell megjelenítése (gömbök, kötések, gyűrűsík). A hologram is ilyen réteg. */
class Layer {
  constructor(holo) {
    this.holo = holo;
    this.group = new THREE.Group();
    this.group.renderOrder = holo ? 2 : 0;
    root.add(this.group);
    this.atoms = []; this.bonds = []; this.rings = [];
    this.m = null; this.P = null; this.adj = null; this.vis = []; this.alpha = [];
  }
  dispose() {
    for (const m of this.atoms) m.material.dispose();
    for (const b of this.bonds) for (const m of b) m.material.dispose();
    for (const r of this.rings) { r.geometry.dispose(); r.material.dispose(); }
    this.group.clear();
    this.atoms = []; this.bonds = []; this.rings = [];
    this.m = null; this.P = null; this.adj = null;
  }
  build(m) {
    this.dispose();
    if (!m) return;
    this.m = m;
    for (let i = 0; i < m.N; i++) {
      const mesh = new THREE.Mesh(sphereGeo, mat(this.holo));
      mesh.userData.atom = i;
      mesh.renderOrder = this.holo ? 2 : 0;
      this.group.add(mesh);
      this.atoms.push(mesh);
    }
    for (let b = 0; b < m.bonds.length; b++) {
      const four = [];
      for (let k = 0; k < 4; k++) {
        const mesh = new THREE.Mesh(cylGeo, mat(this.holo));
        mesh.renderOrder = this.holo ? 2 : 0;
        this.group.add(mesh);
        four.push(mesh);
      }
      this.bonds.push(four);
    }
    if (this.holo) return;
    for (const ring of m.rings) {
      const n = ring.idx.length;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
      const index = [];
      for (let i = 0; i < n; i++) index.push(0, i + 1, ((i + 1) % n) + 1);
      geo.setIndex(index);
      const mm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mm);
      mesh.renderOrder = -1;
      this.group.add(mesh);
      this.rings.push(mesh);
    }
  }
  setVisible(on) { this.group.visible = on; }
  /** P: koordináták, visFn: láthatóság atomonként, opMul: átlátszóság-szorzó */
  update(P, t, visFn, opMul = 1) {
    const m = this.m;
    if (!m) return;
    const holo = this.holo;
    this.P = P;
    const R = RADII[S.style];
    const bondStart = m.paper ? PAPER_T.bond[0] : TIMING.bond[0];
    const k = m.kind === "closure" && !S.hlOpen ? smooth(bondStart, 1, t) : 1;
    const vis = new Array(m.N), alpha = new Array(m.N), cols = new Array(m.N);
    for (let i = 0; i < m.N; i++) {
      vis[i] = visFn(m, i);
      alpha[i] = m.atomAlpha(t, i);
      cols[i] = atomColor(m, i, k, new THREE.Color());
      const mesh = this.atoms[i];
      const show = vis[i] && alpha[i] > 0.01;
      mesh.visible = show;
      if (!show) continue;
      mesh.position.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
      mesh.scale.setScalar(R[m.el[i]] || R.C);
      paint(mesh.material, cols[i], alpha[i] * opMul, holo);
    }
    if (!this.adj) {
      this.adj = Array.from({ length: m.N }, () => []);
      for (const b of m.bonds) { this.adj[b.i].push(b.j); this.adj[b.j].push(b.i); }
    }
    for (let n = 0; n < m.bonds.length; n++) {
      const b = m.bonds[n], four = this.bonds[n];
      const a0 = b.alpha(t) * Math.min(alpha[b.i], alpha[b.j]) * opMul;
      if (S.style === "sf" || !vis[b.i] || !vis[b.j] || a0 < 0.01) { for (const x of four) x.visible = false; continue; }
      vA.set(P[3 * b.i], P[3 * b.i + 1], P[3 * b.i + 2]);
      vB.set(P[3 * b.j], P[3 * b.j + 1], P[3 * b.j + 2]);
      const s2 = b.second(t);
      let off = 0;
      if (s2 > 0.001) {
        // a kettős kötés síkja: egy szomszéd atom felé
        const nb = this.adj[b.i].find((x) => x !== b.j) ?? this.adj[b.j].find((x) => x !== b.i);
        vD.subVectors(vB, vA).normalize();
        if (nb !== undefined) {
          vK.set(P[3 * nb], P[3 * nb + 1], P[3 * nb + 2]).sub(vA);
          vO.copy(vK).addScaledVector(vD, -vK.dot(vD));
        } else vO.set(0, 0, 1).cross(vD);
        if (vO.lengthSq() < 1e-8) vO.set(1, 0, 0).cross(vD);
        vO.normalize();
        off = R.off * s2;
      }
      const rad = s2 > 0.001 ? R.bond + (R.dbl - R.bond) * s2 : R.bond;
      vM.addVectors(vA, vB).multiplyScalar(0.5);
      const line = (sign, ia, ib, alphaMul) => {
        const a = vA.clone().addScaledVector(vO, sign * off);
        const c = vB.clone().addScaledVector(vO, sign * off);
        const mid = vM.clone().addScaledVector(vO, sign * off);
        placeCyl(four[ia], a, mid, rad, cols[b.i], a0 * alphaMul, holo);
        placeCyl(four[ib], mid, c, rad, cols[b.j], a0 * alphaMul, holo);
      };
      if (s2 > 0.001) {
        line(1, 0, 1, 1);
        line(-1, 2, 3, s2);
      } else {
        line(0, 0, 1, 1);
        four[2].visible = four[3].visible = false;
      }
    }
    // gyűrűsík
    m.rings.forEach((ring, n) => {
      const mesh = this.rings[n];
      if (!mesh) return;
      let a = 1;
      if (ring.forming && m.kind === "closure") a = smooth(0.7, 0.95, t);
      mesh.visible = S.ringFill && a > 0.01;
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
      mesh.geometry.computeBoundingSphere();
      mesh.material.color.set(getComputedStyle(document.documentElement).getPropertyValue("--ring-fill").trim() || "#3b82f6");
      mesh.material.opacity = 0.17 * a;
    });
    this.vis = vis;
    this.alpha = alpha;
  }
}
const mainLayer = new Layer(false);
const holoLayer = new Layer(true);
let P = null; // a fő modell aktuális koordinátái
let HP = null; // a hologram koordinátái (a fő modellre illesztve)

function renderFrame() {
  const t = st.t;
  P = model.frame(t, P && P.length === model.N * 3 ? P : undefined);
  mainLayer.update(P, t, atomVisible);
  const holoOn = S.holo && holoModel && holoModel.N === model.N;
  holoLayer.setVisible(holoOn);
  if (holoOn) {
    const X = holoModel.frame(t);
    HP = alignOnto(X, P, model.heavy, HP && HP.length === X.length ? HP : undefined);
    holoLayer.update(HP, t, holoVisible, S.holoOpacity / 100);
  }
}

function buildLabels() {
  $("#labels").innerHTML = "";
  labelEls = [];
  const m = model;
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
  for (const { i, el, link } of labelEls) {
    if (!show || !mainLayer.vis[i] || mainLayer.alpha[i] < 0.3 || (link && (quizHidden() || st.t < 0.6))) { el.hidden = true; continue; }
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
  for (const t of [0, 0.35, 0.65, 1]) {
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
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

// ---------------------------------------------------------------------------
//  Kezelőfelület
// ---------------------------------------------------------------------------
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const STAR_SVG = `<svg class="st" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"/></svg>`;
const isFav = (id) => S.fav.includes(id);
const ALL_IDS = [...DATA.monos.map((m) => m.id), ...DATA.dis.map((d) => d.id)];
const recOf = (id) => MONO.get(id) || DI.get(id);
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
  li.append(b, s);
  return li;
}
const monoItem = (m) => itemButton(m.id, m.name, m.alt || m.formula, !m.alt, `${m.name} ${m.alt} ${m.id}`);
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
  // Csillagozottak előre (ha a kereső melletti csillag be van kapcsolva)
  if (S.favFirst) {
    const fm = DATA.monos.filter((m) => isFav(m.id)), fd = DIS_SORTED.filter((d) => isFav(d.id));
    const fav = details("lvl1 fav", "Csillagozottak", `<span class="count">${fm.length + fd.length}</span>`, true, "fav");
    if (fm.length) subList(fav, "Monoszacharidok", fm.map(monoItem));
    if (fd.length) subList(fav, "Diszacharidok", fd.map(diItem));
    if (!fm.length && !fd.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Még nincs csillagozott molekula. A nevek melletti csillaggal jelölheted meg őket.";
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
  for (const b of $$(".item")) b.setAttribute("aria-current", String(!Q.on && !!st.rec && b.dataset.id === st.rec.id));
}

function toggleFav(id) {
  const i = S.fav.indexOf(id);
  if (i >= 0) S.fav.splice(i, 1);
  else S.fav.push(id);
  save();
  if (S.favFirst) buildTree();
  else $$(`.star[data-star="${id}"]`).forEach((b) => b.setAttribute("aria-pressed", String(isFav(id))));
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
  for (const e of ["C", "O", "H", "N"]) $(`#el-${e}`).value = S.el[e];
  $$("#segStyle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.style)));
  $("#speed").value = String(S.speed);
  controls.autoRotate = !!S.autoRotate;
  $("#favFirst").setAttribute("aria-pressed", String(!!S.favFirst));
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
  for (const e of ["C", "O", "H", "N"]) {
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
    if (!b || b.disabled || b.dataset.tl === st.tl) return;
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
    if (e.code !== "Space" || e.target.closest("input, select, textarea, button")) return;
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
    const b = e.target.closest(".item");
    if (!b) return;
    select(b.dataset.id);
    closeDrawers();
  });
  $("#favFirst").addEventListener("click", () => {
    S.favFirst = !S.favFirst;
    save();
    $("#favFirst").setAttribute("aria-pressed", String(S.favFirst));
    buildTree();
  });
  $("#segMode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setMode(b.dataset.v);
  });
  $("#qOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (b && !b.disabled) quizAnswer(b.dataset.id);
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

function hasTimeline() {
  return model && model.kind !== "static";
}
function togglePlay() {
  if (!hasTimeline()) return;
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
  st.cfg = rec.cfg || "D";
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
const Q = { on: false, id: null, opts: [], answered: false, picked: null, last: null };
const quizHidden = () => Q.on && !Q.answered;
const hideName = (s) => (quizHidden() ? "?" : s);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function quizPool() {
  const favs = S.fav.filter((id) => recOf(id));
  return favs.length >= 2 ? { ids: favs, starred: true } : { ids: ALL_IDS, starred: false };
}
function quizNew() {
  const pool = quizPool();
  let cand = pool.ids.filter((id) => id !== Q.last);
  if (!cand.length) cand = pool.ids;
  const id = cand[Math.floor(Math.random() * cand.length)];
  const isDi = DI.has(id);
  // válaszlehetőségek: a csillagozottakból, ha kevés, hasonló molekulákkal kiegészítve
  let others = shuffle(pool.ids.filter((x) => x !== id && DI.has(x) === isDi));
  if (others.length < 3) others = others.concat(shuffle(pool.ids.filter((x) => x !== id && DI.has(x) !== isDi)));
  if (others.length < 3) {
    const rank = (x) => (isDi ? 0 : Math.abs(MONO.get(x).n - MONO.get(id).n));
    const extra = shuffle(ALL_IDS.filter((x) => x !== id && !others.includes(x) && DI.has(x) === isDi))
      .sort((a, b) => rank(a) - rank(b));
    others = others.concat(extra);
  }
  Q.id = id;
  Q.last = id;
  Q.opts = shuffle([id, ...others.slice(0, 3)]);
  Q.answered = false;
  Q.picked = null;
  const rec = recOf(id);
  const vkey = rec.v && rec.v.length ? rec.v[Math.floor(Math.random() * rec.v.length)].key : null;
  load(id, { vkey });
  renderQuiz();
}
function quizAnswer(id) {
  if (!Q.on || Q.answered || !recOf(id)) return;
  Q.answered = true;
  Q.picked = id;
  S.quiz.total++;
  if (id === Q.id) S.quiz.ok++;
  save();
  closeDrawers();
  renderQuiz();
  updateStaticUI();
  changed();
}
function renderQuiz() {
  $("#quiz").hidden = !Q.on;
  $(".title-block").hidden = Q.on;
  $(".app").classList.toggle("quiz-mode", Q.on);
  $$("#segMode button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "quiz") === Q.on)));
  if (!Q.on) return;
  const pool = quizPool();
  $("#qScore").textContent = `Helyes: ${S.quiz.ok} / ${S.quiz.total}`;
  $("#qPool").textContent = pool.starred
    ? `A ${pool.ids.length} csillagozott molekulából kérdezek.`
    : "Nincs legalább két csillagozott molekula, ezért az összesből kérdezek. A listában a csillaggal jelölheted ki, mit gyakorolj.";
  $("#qOpts").innerHTML = "";
  for (const id of Q.opts) {
    const r = recOf(id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt";
    b.dataset.id = id;
    b.innerHTML = `<span></span><small></small>`;
    b.querySelector("span").textContent = r.name;
    b.querySelector("small").textContent = DI.has(id) ? "diszacharid" : "monoszacharid";
    if (Q.answered) {
      b.disabled = true;
      if (id === Q.id) b.classList.add("ok");
      else if (id === Q.picked) b.classList.add("bad");
    }
    $("#qOpts").appendChild(b);
  }
  const r = recOf(Q.id);
  if (!Q.answered) {
    $("#qMsg").textContent = "Forgasd, válts 2D-re, játszd le, aztán válassz! A listából is választhatsz.";
    $("#qNext").textContent = "Másikat kérek";
  } else {
    const ok = Q.picked === Q.id;
    const extra = st.di ? ` – ${bondInfo(r).long}` : "";
    const picked = ok ? "" : ` (Te ezt választottad: ${recOf(Q.picked).name}.)`;
    $("#qMsg").innerHTML = `<b>${ok ? "Helyes!" : "Nem talált."}</b> Ez ${ok ? "" : "volt "}a molekula: <b></b> · <span></span>${extra}${picked}`;
    $("#qMsg").querySelector("b + b").textContent = r.name;
    $("#qMsg").querySelector("span").textContent = stateName();
    $("#qNext").textContent = "Következő molekula";
  }
}
function setMode(mode) {
  const on = mode === "quiz";
  if (on === Q.on) return;
  Q.on = on;
  if (on) {
    quizNew();
    try { history.replaceState(null, "", "#tippelo"); } catch { /* beágyazott nézet */ }
  } else {
    try { history.replaceState(null, "", `#${st.rec.id}`); } catch { /* beágyazott nézet */ }
    renderQuiz();
    markCurrent();
    updateStaticUI();
    changed();
  }
}

function pickModels() {
  const paper = S.view === "paper" && models.mP;
  model = paper ? models.mP : models.m3;
  holoModel = paper ? models.m3 : models.mP;
  P = null;
  HP = null;
  mainLayer.build(model);
  holoLayer.build(holoModel);
  buildLabels();
}
function rebuild(refit) {
  models = buildModels();
  pickModels();
  if (refit) fitCamera();
  updateStaticUI();
  changed();
}

let dirty = true;
function changed() { dirty = true; }

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
  if (!st.di) {
    $("#eyebrow").textContent = `Monoszacharid · ${CLS1[r.n]} · ${SUB1[r.sub]}`;
  } else {
    $("#eyebrow").textContent = `Diszacharid · ${unitName(r.A)} + ${unitName(r.B)} · ${r.reducing ? "redukáló" : "nem redukáló"}`;
  }
  // forma-választók
  const cfgBtns = $$("#segCfg button");
  const chiral = !st.di && !!r.cfg;
  cfgBtns.forEach((b) => { b.disabled = !chiral; b.setAttribute("aria-pressed", String(chiral && b.dataset.v === st.cfg)); });
  const ringBtns = $$("#segRing button"), anBtns = $$("#segAn button");
  let hint = "";
  if (!st.di) {
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
    b.disabled = b.dataset.tl === "closure" && st.di && !r.reducing;
  });
  const tl = hasTimeline();
  for (const id of ["#btnStart", "#btnEnd", "#btnPlay", "#scrub", "#speed"]) $(id).disabled = !tl;
  const cond = model.kind === "cond";
  $("#btnStart").textContent = cond ? "Két monoszacharid" : model.paper ? "Fischer-projekció" : "Nyílt lánc";
  $("#btnEnd").textContent = cond ? "Diszacharid" : model.paper ? "Haworth-képlet" : "Gyűrűs forma";
  // nézet és hologram
  const hasPaper = !!models.mP;
  $$("#segView button, #segViewQ button").forEach((b) => {
    b.disabled = b.dataset.v === "paper" && !hasPaper;
    b.setAttribute("aria-pressed", String(b.dataset.v === (model.paper ? "paper" : "3d")));
  });
  $("#holoHint").textContent = model.paper
    ? "A valódi térbeli modellt vetíti áttetszően a papírmodellre."
    : "A papírmodellt (Fischer-projekció / Haworth-képlet) vetíti áttetszően a 3D modellre.";
}

// ---- állapotfüggő szövegek -------------------------------------------------------
function stateName() {
  const r = st.rec, t = st.t;
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

function caption() {
  const t = st.t, m = model, r = st.rec;
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

function updateDynamicUI() {
  $("#stateName").textContent = stateName();
  const r = st.rec;
  const chips = [`<span class="chip mono">${r.formula}</span>`, `<span class="chip">${fmtMass(r.mass)}</span>`];
  if (st.di) {
    const bi = bondInfo(r);
    chips.push(`<span class="chip bond" title="${bi.long}"><i class="dot" style="background:${S.colors.bridge}"></i>${bi.short}</span>`);
    $("#bondLine").textContent = bi.long;
  }
  $("#bondLine").hidden = !st.di;
  $("#chips").innerHTML = chips.join("");
  $("#caption").innerHTML = caption();
  $("#scrub").value = String(Math.round(st.t * 1000));
  $("#btnStart").classList.toggle("on", st.t <= 0.001 && hasTimeline());
  $("#btnEnd").classList.toggle("on", st.t >= 0.999 && hasTimeline());
  $(".i-play").toggleAttribute("hidden", st.playing);
  $(".i-pause").toggleAttribute("hidden", !st.playing);
  $("#btnPlay").setAttribute("aria-label", st.playing ? "Szünet" : "Lejátszás");
  // jelmagyarázat
  const leg = [];
  for (const g of GROUPS) {
    if (!model.present.has(g.key) || !S.hl[g.key] || !S.vis[g.key]) continue;
    if (g.key === "glyc" && model.kind === "cond" && !model.v.g.glyc.length && st.t >= 0.98) continue;
    leg.push(`<span><i class="dot" style="background:${S.colors[g.key]}"></i>${g.name}</span>`);
  }
  $("#legend").innerHTML = leg.join("");
  // Haworth-térállás (gyűrűs monoszacharid)
  const rel = [];
  if (!st.di && model.kind === "closure" && st.t >= 0.999) {
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
  $("#rel").innerHTML = rel.join("");
}

// ---- egérmutató alatti atom -----------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = $("#tooltip");
let pointerDown = false;
canvas.addEventListener("pointerdown", () => { pointerDown = true; tip.hidden = true; });
window.addEventListener("pointerup", () => { pointerDown = false; });
canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
canvas.addEventListener("pointermove", (e) => {
  if (pointerDown || e.pointerType === "touch") return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(mainLayer.atoms.filter((m) => m.visible), false)[0];
  if (!hit) { tip.hidden = true; return; }
  const i = hit.object.userData.atom;
  tip.innerHTML = atomInfo(i);
  tip.hidden = false;
  const x = e.clientX - rect.left + 14, y = e.clientY - rect.top + 14;
  tip.style.left = `${Math.min(x, rect.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(y, rect.height - tip.offsetHeight - 8)}px`;
});
const EL_NAME = { C: "szén", O: "oxigén", H: "hidrogén", N: "nitrogén" };
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
    lab = host !== null && m.lab[host] ? `${m.el[i]} · ${m.lab[host]}-hez kötve` : m.el[i] === "H" ? "H" : `${m.el[i]} (acetilcsoport)`;
  }
  const g = m.groupOf[i];
  return `<b>${lab}</b> · ${EL_NAME[m.el[i]]}${g ? ` · ${GROUP[g].name}` : ""}`;
}

// ---- fő ciklus ---------------------------------------------------------------
const DURATION = { closure: 7, paper: 9, cond: 7.5 };
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.playing && hasTimeline()) {
    st.t += (dt * S.speed) / DURATION[model.kind === "cond" ? "cond" : model.paper ? "paper" : "closure"];
    if (st.t >= 1) { st.t = 1; st.playing = false; }
    dirty = true;
  }
  const moved = controls.update();
  if (dirty) {
    renderFrame();
    updateDynamicUI();
    dirty = false;
  }
  renderer.render(scene, camera);
  updateLabels();
  void moved;
  requestAnimationFrame(loop);
}

// ---- indulás -------------------------------------------------------------------
buildTree();
buildHlRows();
buildHoloParts();
bindControls();
syncControls();
resize();
const startId = decodeURIComponent((location.hash || "").slice(1));
load(recOf(startId) ? startId : "glukoz");
renderQuiz();
if (startId === "tippelo") setMode("quiz");
window.addEventListener("hashchange", () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id === "tippelo") setMode("quiz");
  else if (recOf(id) && (Q.on || id !== st.rec.id)) { setMode("view"); select(id); }
});
requestAnimationFrame(loop);
