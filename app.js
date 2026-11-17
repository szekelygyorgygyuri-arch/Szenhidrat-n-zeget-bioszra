// Szénhidrát 3D – megjelenítés és kezelőfelület
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeClosure, makeCondensation, makeStatic, smooth, TIMING } from "./kinematics.js";

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
};
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
let model = null;

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

/** A kiválasztott molekulából és formából felépíti a megjelenítendő modellt. */
function buildModel() {
  const r = st.rec;
  let m;
  if (!st.di) {
    const mirror = st.cfg === "L";
    const v = r.v.find((x) => x.key === st.vkey);
    const Xo = f64(r.open.x, mirror);
    if (!v) {
      m = makeStatic(Xo, r.open.b);
      Object.assign(m, { el: r.el, lab: r.lab, bb: r.bb, groups: {}, ohs: r.ohs0, rings: [], kind: "static" });
    } else {
      const Xr = f64(v.x, mirror);
      m = makeClosure({ el: r.el, Xo, Xr, bo: r.open.b, br: v.b, root: v.root, tH: v.tH, tHo: v.tHo, tHr: v.tHr, aC: v.aC, ringForm: v.ringIdx });
      Object.assign(m, { el: r.el, lab: r.lab, bb: r.bb, groups: v.g, ohs: v.ohs, kind: "closure", v,
        rings: [{ idx: v.ringIdx, forming: true }] });
    }
  } else {
    const v = r.v.find((x) => x.key === st.vkey);
    const N = v.N;
    if (st.tl === "cond") {
      const c = v.cond;
      m = makeCondensation({ free: Float64Array.from(c.free), fin: Float64Array.from(v.x), u: c.u, side: c.side,
        gMid: Float64Array.from(c.gMid), gEnd: Float64Array.from(c.gEnd), newBond: c.newBond, gBonds: c.gBonds, N, bonds: v.b });
      const g = { ...v.g, glyc: [...v.g.glyc, N, N + 1] };
      Object.assign(m, { el: r.el, lab: r.lab, bb: r.bb, groups: g, ohs: v.ohs, kind: "cond", v,
        rings: [{ idx: v.ringA }, { idx: v.ringB }] });
    } else if (v.open) {
      m = makeClosure({ el: r.el, Xo: Float64Array.from(v.open.x), Xr: Float64Array.from(v.x), bo: v.open.b, br: v.b,
        root: v.root, tH: v.tH, tHo: v.tHo, tHr: v.tHr, aC: v.aC, ringForm: v.ringB });
      Object.assign(m, { el: r.el.slice(0, N), lab: r.lab.slice(0, N), bb: r.bb.slice(0, N), groups: v.g, ohs: v.ohs,
        kind: "closure", v, rings: [{ idx: v.ringA }, { idx: v.ringB, forming: true }] });
    } else {
      m = makeStatic(Float64Array.from(v.x), v.b);
      Object.assign(m, { el: r.el.slice(0, N), lab: r.lab.slice(0, N), bb: r.bb.slice(0, N), groups: v.g, ohs: v.ohs,
        kind: "static", v, rings: [{ idx: v.ringA }, { idx: v.ringB }] });
    }
  }
  m.groupOf = groupOf(m.N, m.groups);
  m.ohSet = new Set();
  for (const [o, h] of m.ohs || []) { m.ohSet.add(o); m.ohSet.add(h); }
  m.present = new Set(GROUPS.map((g) => g.key).filter((k) => (m.groups[k] || []).length));
  return m;
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

let atomMeshes = [];
let bondMeshes = []; // bondonként 4 henger: [vonal1-fél1, vonal1-fél2, vonal2-fél1, vonal2-fél2]
let ringMeshes = [];
let labelEls = [];

function mat() {
  return new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.02, envMapIntensity: 0.9 });
}
function disposeScene() {
  for (const m of atomMeshes) m.material.dispose();
  for (const b of bondMeshes) for (const m of b) m.material.dispose();
  for (const r of ringMeshes) { r.geometry.dispose(); r.material.dispose(); }
  root.clear();
  atomMeshes = []; bondMeshes = []; ringMeshes = [];
  $("#labels").innerHTML = "";
  labelEls = [];
}

function buildScene() {
  disposeScene();
  const m = model;
  for (let i = 0; i < m.N; i++) {
    const mesh = new THREE.Mesh(sphereGeo, mat());
    mesh.userData.atom = i;
    root.add(mesh);
    atomMeshes.push(mesh);
  }
  for (let b = 0; b < m.bonds.length; b++) {
    const four = [];
    for (let k = 0; k < 4; k++) {
      const mesh = new THREE.Mesh(cylGeo, mat());
      root.add(mesh);
      four.push(mesh);
    }
    bondMeshes.push(four);
  }
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
    root.add(mesh);
    ringMeshes.push(mesh);
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

function atomColor(i, k, out) {
  const el = model.el[i];
  out.copy(elColor[el] || elColor.C);
  const g = model.groupOf[i];
  if (!g || !S.hl[g] || k <= 0) return out;
  tmpC.copy(hlColor[g]);
  if (el === "H") tmpC.lerp(WHITE, 0.45);
  else if (el === "C") tmpC.lerp(BLACK, 0.16);
  return out.lerp(tmpC, k);
}

function atomVisible(i) {
  const el = model.el[i];
  if (el === "H" && !S.showH) return false;
  if (!S.showOH && model.ohSet.has(i)) return false;
  const g = model.groupOf[i];
  if (g && !S.vis[g]) return false;
  return true;
}

// ---- képkocka ---------------------------------------------------------------
let P = null;
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vD = new THREE.Vector3(), vO = new THREE.Vector3();
const vM = new THREE.Vector3(), vK = new THREE.Vector3();

function placeCyl(mesh, a, b, r, color, opacity) {
  vD.subVectors(b, a);
  const L = vD.length();
  if (L < 1e-6 || opacity < 0.01 || r <= 0) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, vD.multiplyScalar(1 / L));
  mesh.scale.set(r, L, r);
  mesh.material.color.copy(color);
  setOpacity(mesh.material, opacity);
}
function setOpacity(m, a) {
  const tr = a < 0.995;
  if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
  m.opacity = a;
  m.depthWrite = a > 0.6;
}

const colA = new THREE.Color(), colB = new THREE.Color();
let adjCache = null;

function renderFrame() {
  const m = model;
  const t = st.t;
  P = m.frame(t, P && P.length === m.N * 3 ? P : undefined);
  const R = RADII[S.style];
  const k = m.kind === "closure" && !S.hlOpen ? smooth(TIMING.bond[0], 1, t) : 1;
  const vis = new Array(m.N), alpha = new Array(m.N), cols = new Array(m.N);
  for (let i = 0; i < m.N; i++) {
    vis[i] = atomVisible(i);
    alpha[i] = m.atomAlpha(t, i);
    cols[i] = atomColor(i, k, new THREE.Color());
    const mesh = atomMeshes[i];
    const show = vis[i] && alpha[i] > 0.01;
    mesh.visible = show;
    if (!show) continue;
    mesh.position.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
    mesh.scale.setScalar(R[m.el[i]] || R.C);
    mesh.material.color.copy(cols[i]);
    setOpacity(mesh.material, alpha[i]);
  }
  // szomszédok a kettős kötések síkjához
  if (!adjCache) {
    adjCache = Array.from({ length: m.N }, () => []);
    for (const b of m.bonds) { adjCache[b.i].push(b.j); adjCache[b.j].push(b.i); }
  }
  for (let n = 0; n < m.bonds.length; n++) {
    const b = m.bonds[n], four = bondMeshes[n];
    const a0 = b.alpha(t) * Math.min(alpha[b.i], alpha[b.j]);
    if (S.style === "sf" || !vis[b.i] || !vis[b.j] || a0 < 0.01) { for (const x of four) x.visible = false; continue; }
    vA.set(P[3 * b.i], P[3 * b.i + 1], P[3 * b.i + 2]);
    vB.set(P[3 * b.j], P[3 * b.j + 1], P[3 * b.j + 2]);
    const s2 = b.second(t);
    let off = 0;
    if (s2 > 0.001) {
      // a kettős kötés síkja: egy szomszéd atom felé
      const nb = adjCache[b.i].find((x) => x !== b.j) ?? adjCache[b.j].find((x) => x !== b.i);
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
      placeCyl(four[ia], a, mid, rad, cols[b.i], a0 * alphaMul);
      placeCyl(four[ib], mid, c, rad, cols[b.j], a0 * alphaMul);
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
    const mesh = ringMeshes[n];
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
  frameVis = vis;
  frameAlpha = alpha;
}
let frameVis = [], frameAlpha = [];

function updateLabels() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  const show = S.labels;
  for (const { i, el } of labelEls) {
    if (!show || !frameVis[i] || frameAlpha[i] < 0.3) { el.hidden = true; continue; }
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
  const dir = new THREE.Vector3(0, 0.36, 1).normalize();
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
  li.appendChild(b);
  return li;
}
const chev = `<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;
function details(cls, title, extra, open) {
  const d = document.createElement("details");
  d.className = `grp ${cls}`;
  d.open = open;
  d.innerHTML = `<summary>${chev}<span></span>${extra || ""}</summary>`;
  d.querySelector("summary span").textContent = title;
  return d;
}

function buildTree() {
  const nav = $("#tree");
  nav.innerHTML = "";
  // Monoszacharidok: szénatomszám szerint növekvő sorrendben
  const mono = details("lvl1", "Monoszacharidok", `<span class="count">${DATA.monos.length}</span>`, true);
  for (const n of [3, 4, 5, 6, 7]) {
    const list = DATA.monos.filter((m) => m.n === n);
    if (!list.length) continue;
    const d2 = details("lvl2", `${CLS[n]} `, `<span class="cn">C${subNum(n)}</span>`, n === 6);
    for (const s of SUBS) {
      const ls = list.filter((m) => m.sub === s);
      if (!ls.length) continue;
      const h = document.createElement("div");
      h.className = "subhead";
      h.textContent = SUB[s];
      const ul = document.createElement("ul");
      ul.className = "items";
      for (const m of ls) ul.appendChild(itemButton(m.id, m.name, m.alt || m.formula, !m.alt, `${m.name} ${m.alt} ${m.id}`));
      d2.append(h, ul);
    }
    mono.appendChild(d2);
  }
  nav.appendChild(mono);

  // Diszacharidok: az 1. egység szerint, egyezés esetén a 2. szerint
  const pos = (d) => +((d.link.match(/[→↔](\d)/) || [0, 9])[1]);
  const dis = [...DATA.dis].sort((a, b) =>
    MONO_IDX.get(a.A) - MONO_IDX.get(b.A) || MONO_IDX.get(a.B) - MONO_IDX.get(b.B) ||
    pos(a) - pos(b) || a.link.localeCompare(b.link));
  const top = details("lvl1", "Diszacharidok", `<span class="count">${dis.length}</span>`, true);
  let curCls = null, curPair = null, d2 = null, ul = null;
  for (const d of dis) {
    const nA = MONO.get(d.A).n, nB = MONO.get(d.B).n;
    const cls = `${CLS1[nA]} + ${CLS1[nB]}`;
    if (cls !== curCls) {
      curCls = cls;
      curPair = null;
      d2 = details("lvl2", cls, "", nA === 6 && nB === 6);
      top.appendChild(d2);
    }
    const pair = `${unitName(d.A)} + ${unitName(d.B)}`;
    if (pair !== curPair) {
      curPair = pair;
      const h = document.createElement("div");
      h.className = "subhead";
      h.textContent = pair;
      ul = document.createElement("ul");
      ul.className = "items";
      d2.append(h, ul);
    }
    ul.appendChild(itemButton(d.id, d.name, d.link, true, `${d.name} ${d.alt} ${d.id} ${pair}`));
  }
  nav.appendChild(top);
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.id = "emptyMsg";
  empty.hidden = true;
  empty.textContent = "Nincs ilyen nevű molekula a listában.";
  nav.appendChild(empty);

  nav.addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (!b) return;
    select(b.dataset.id);
    closeDrawers();
  });
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
    d.hidden = !vis;
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
function select(id) {
  const rec = MONO.get(id) || DI.get(id);
  if (!rec) return;
  st.rec = rec;
  st.di = DI.has(id);
  st.cfg = rec.cfg || "D";
  st.vkey = rec.defv || null;
  st.tl = "closure";
  st.playing = false;
  const closable = st.di ? rec.reducing : rec.v.length > 0;
  if (st.di && !rec.reducing) st.tl = "cond";
  st.t = closable || st.di ? 1 : 0;
  for (const b of $$(".item")) b.setAttribute("aria-current", String(b.dataset.id === id));
  try { history.replaceState(null, "", `#${id}`); } catch { /* beágyazott nézet */ }
  rebuild(true);
}

function rebuild(refit) {
  model = buildModel();
  adjCache = null;
  P = null;
  buildScene();
  if (refit) fitCamera();
  updateStaticUI();
  changed();
}

let dirty = true;
function changed() { dirty = true; }

function fmtMass(m) { return `${m.toFixed(2).replace(".", ",")} g/mol`; }

function updateStaticUI() {
  const r = st.rec;
  $("#title").textContent = r.name;
  $("#alt").textContent = r.alt ? r.alt : "";
  $("#desc").textContent = r.desc;
  document.title = `${r.name} – Szénhidrát 3D`;
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
  $("#btnStart").textContent = cond ? "Két monoszacharid" : "Nyílt lánc";
  $("#btnEnd").textContent = cond ? "Diszacharid" : "Gyűrűs forma";
}

// ---- állapotfüggő szövegek -------------------------------------------------------
function stateName() {
  const r = st.rec, t = st.t;
  if (!st.di) {
    const v = model.v;
    if (!v || t <= 0.001) return `${lowerName(r)} – nyílt láncú forma`;
    const nm = v.name.replace("{cfg}", st.cfg);
    if (t >= 0.999) return nm;
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
  if (model.kind === "closure" && t <= 0.001) return `${v.common.replace(/^[αβ]-/, "")} – nyílt láncú forma (a redukáló vég felnyílt)`;
  return `${v.common} · ${v.name}`;
}

function caption() {
  const t = st.t, m = model, r = st.rec;
  if (m.kind === "static") {
    if (!st.di) return r.v.length ? "" : "Ez a molekula nem képez stabil gyűrűt; csak nyílt láncú formája létezik.";
    return "<b>Nem redukáló diszacharid.</b> Mindkét glikozidos OH a kötésben van, ezért egyik gyűrű sem nyílhat fel. Nézd meg a glikozidos kötés kialakulását!";
  }
  if (m.kind === "closure") {
    const v = m.v, L = m.lab;
    const a = L[v.aC], ok = L[v.rO], oa = L[v.aO];
    const keto = !st.di ? r.kind === "keto" : MONO.get(r.B).kind === "keto";
    const grp = keto ? "ketocsoport" : "aldehidcsoport";
    if (t <= 0.001) return `<span class="phase">0.</span><b>Nyílt láncú forma.</b> A ${a} ${grp} (C=O) szabad; az ${ok} hidroxilcsoportja fogja támadni. Indítsd el a lejátszást!`;
    if (t < TIMING.bond[0]) return `<span class="phase">1.</span><b>A szénlánc elfordul</b> a C–C kötések mentén, így az ${ok} oxigénje a ${a} karbonil-szénatom közelébe kerül.`;
    if (t < TIMING.hop[0]) return `<span class="phase">2.</span><b>Az ${ok} nemkötő elektronpárja megtámadja a ${a}-et:</b> új C–O kötés jön létre, a C=O kettős kötés felnyílik, a ${a} tetraéderessé válik.`;
    if (t < 0.999) return `<span class="phase">3.</span><b>A H átkerül az ${oa}-re:</b> kialakul a glikozidos OH-csoport.`;
    const name = st.di ? v.common : v.name.replace("{cfg}", st.cfg);
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
  if (t < 0.999) return `<span class="phase">3.</span><b>A vízmolekula eltávozik.</b> Kialakult a glikozidos kötés: ${r.link}.`;
  void N;
  return `<b>Diszacharid: ${v.common}.</b> Glikozidos kötés: ${r.link} (${cA}–O–${m.lab[v.cond.newBond[1]].replace(/^O/, "C")}). ${r.reducing ? "A második egység glikozidos OH-ja szabad, ezért redukáló." : "Nincs szabad glikozidos OH, ezért nem redukáló."}`;
}

function updateDynamicUI() {
  $("#stateName").textContent = stateName();
  const r = st.rec;
  const chips = [`<span class="chip mono">${r.formula}</span>`, `<span class="chip">${fmtMass(r.mass)}</span>`];
  if (st.di) chips.push(`<span class="chip mono">${r.link}</span>`);
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
  const hit = ray.intersectObjects(atomMeshes.filter((m) => m.visible), false)[0];
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
const DURATION = { closure: 7, cond: 7.5 };
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.playing && hasTimeline()) {
    st.t += (dt * S.speed) / DURATION[model.kind === "cond" ? "cond" : "closure"];
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
bindControls();
syncControls();
resize();
const startId = decodeURIComponent((location.hash || "").slice(1));
select(MONO.has(startId) || DI.has(startId) ? startId : "glukoz");
window.addEventListener("hashchange", () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if ((MONO.has(id) || DI.has(id)) && id !== st.rec.id) select(id);
});
requestAnimationFrame(loop);
