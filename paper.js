// Szénhidrát 3D – papír (2D) modellek
// ---------------------------------------------------------------------------
// A tankönyvi ábrák térbeli megfelelői:
//   • nyílt lánc  → Fischer-projekció (függőleges szénlánc, C1 felül, a
//     szubsztituensek vízszintesen jobbra vagy balra)
//   • gyűrűs forma → Haworth-képlet (vízszintes, szabályos gyűrű, a
//     szubsztituensek függőlegesen fel vagy le)
// A jobbra/balra és fel/le irányokat a valódi 3D szerkezetből olvassuk ki,
// így a papírmodell mindig ugyanazt a sztereokémiát mutatja.
//
// A gyűrűzáródás a tankönyvi lépéseket követi: a Fischer-projekciót
// elforgatjuk, a láncot gyűrűvé hajlítjuk, a gyűrű-O-t hordozó szénatom körül
// elfordulunk, végül záródik a gyűrű és a H átkerül (glikozidos OH).

import { smooth, ease, bondUnion } from "./kinematics.js";

const LH = 0.92; // kötéshossz H-hoz
const LX = 1.28; // kötéshossz nehézatomhoz
const LCC = 1.5; // C–C a Fischer-láncban
const UPV = [0, 1, 0];
const DOWNV = [0, -1, 0];
const PYR = [0, -60, -120, 180, 120, 60]; // Haworth: anomer C jobbra, gyűrű-O hátul-jobbra
const FUR = [18, -54, -126, 162, 90]; // furanóz: gyűrű-O hátul középen

// ---- vektorok ---------------------------------------------------------------
const get = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const put = (P, i, x) => { P[3 * i] = x[0]; P[3 * i + 1] = x[1]; P[3 * i + 2] = x[2]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
const perp = (v, n) => sub(v, mul(n, dot(v, n)));
function rotAxis(v, k, ang) { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
function centroid(P, idx) {
  let c = [0, 0, 0];
  for (const i of idx) c = add(c, get(P, i));
  return mul(c, 1 / idx.length);
}
export function adjacency(N, bonds) {
  const a = Array.from({ length: N }, () => []);
  for (const [i, j] of bonds) { a[i].push(j); a[j].push(i); }
  return a;
}

// ---- elágazások elhelyezése ---------------------------------------------------
// S már a helyén van, P felől jöttünk, dir az S-be mutató kötés iránya.
// A lánc folytatása (szén, ill. az első nehézatom) egyenesen tovább megy,
// a többi szubsztituens oldalra kerül (ctx.side tengely mentén), a sorrendet
// a 3D szerkezetből vesszük.
function branch(ctx, S, P, dir) {
  const { adj, el, out, placed, inUnit, X3 } = ctx;
  const kids = adj[S].filter((c) => c !== P && !placed[c] && inUnit(c));
  if (!kids.length) return;
  const vert = Math.abs(dir[1]) > 0.7;
  const side = vert ? ctx.side : UPV;
  const side3 = vert ? ctx.side3 : ctx.up3;
  // oldalirány: függőleges ágnál a kontextus szerint, vízszintesnél kissé előre döntve
  const sdir = (s) => (vert ? ctx.sideDir(s) : unit(add(mul(UPV, s), mul(dir, 0.6))));
  const sp = get(out, S);
  const place = (c, d) => { put(out, c, add(sp, mul(d, el[c] === "H" ? LH : LX))); placed[c] = 1; return [c, d]; };
  const heavy = kids.filter((c) => el[c] !== "H");
  const hs = kids.filter((c) => el[c] === "H");
  const next = [];
  if ((el[S] === "O" || el[S] === "N") && !heavy.length) {
    // –OH / –NH₂: a H vízszintesen kifelé, mint a rajzon az „OH”
    place(hs[0], vert ? ctx.hdir : dir);
    if (hs[1]) place(hs[1], vert ? dir : sdir(1));
    return;
  }
  let cont = heavy.find((c) => el[c] === "C");
  if (cont === undefined) cont = heavy[0];
  const rest = kids.filter((c) => c !== cont);
  if (cont === undefined) cont = rest.shift();
  next.push(place(cont, dir));
  const proj = (c) => dot(sub(get(X3, c), get(X3, S)), side3);
  if (rest.length === 1) {
    next.push(place(rest[0], sdir(proj(rest[0]) >= 0 ? 1 : -1)));
  } else if (rest.length >= 2) {
    const [a, b] = proj(rest[0]) >= proj(rest[1]) ? [rest[0], rest[1]] : [rest[1], rest[0]];
    next.push(place(a, sdir(1)));
    next.push(place(b, sdir(-1)));
    for (let k = 2; k < rest.length; k++) next.push(place(rest[k], unit(add(dir, side))));
  }
  for (const [c, d] of next) branch(ctx, c, S, d);
}

// ---- Haworth-képlet -----------------------------------------------------------
/**
 * Egy gyűrű Haworth-elrendezése. A gyűrű a vízszintes (xz) síkban fekszik,
 * felülről nézve az óramutató járása szerint számozva; a szubsztituensek
 * függőlegesen állnak (fent/lent a 3D szerkezet szerint).
 * Visszaadja a más egységbe vezető kötések (glikozidos híd) irányát is.
 */
export function haworthLayout({ X3, el, adj, ring, ringType, inUnit, out, placed, origin = [0, 0, 0], yaw = 0 }) {
  const base = ringType === "p" ? PYR : FUR;
  const R = ringType === "p" ? 1.5 : 1.3;
  const c3 = centroid(X3, ring);
  let nrm = [0, 0, 0];
  for (let j = 0; j < ring.length; j++) {
    nrm = add(nrm, cross(sub(get(X3, ring[j]), c3), sub(get(X3, ring[(j + 1) % ring.length]), c3)));
  }
  const up3 = unit(mul(nrm, -1));
  const info = { bridge: [], up3, center: origin, R };
  const radial = [];
  ring.forEach((a, j) => {
    const ang = ((base[j] + yaw) * Math.PI) / 180;
    const r = [Math.cos(ang), 0, -Math.sin(ang)];
    radial.push(r);
    put(out, a, add(origin, mul(r, R)));
    placed[a] = 1;
  });
  const todo = [];
  ring.forEach((a, j) => {
    const exo = adj[a].filter((c) => !ring.includes(c));
    if (!exo.length) return;
    const pr = exo.map((c) => dot(sub(get(X3, c), get(X3, a)), up3));
    const ord = exo.map((_, k) => k).sort((p, q) => pr[q] - pr[p]);
    const r3 = unit(perp(sub(get(X3, a), c3), up3));
    const r = radial[j];
    const t = cross(UPV, r);
    const ctx = {
      X3, el, adj, out, placed, inUnit, up3,
      side: t, side3: cross(up3, r3), hdir: r,
      sideDir: (s) => unit(add(mul(t, s), mul(r, 0.7))),
    };
    ord.forEach((k, n) => {
      const c = exo[k];
      const d = exo.length === 1 ? (pr[k] >= 0 ? UPV : DOWNV) : n === 0 ? UPV : DOWNV;
      if (!inUnit(c)) { info.bridge.push({ from: a, atom: c, dir: d[1] }); return; }
      if (placed[c]) return;
      put(out, c, add(get(out, a), mul(d, el[c] === "H" ? LH : LX)));
      placed[c] = 1;
      todo.push([ctx, c, a, d]);
    });
  });
  for (const [ctx, c, a, d] of todo) branch(ctx, c, a, d);
  return info;
}

// ---- Fischer-projekció -----------------------------------------------------------
/** +1, ha a heteroatom a Fischer-projekcióban jobbra áll, −1, ha balra. */
export function fischerSide(X3, up, c, down, x) {
  const C = get(X3, c);
  const v = dot(sub(get(X3, up), C), cross(sub(get(X3, down), C), sub(get(X3, x), C)));
  return v < 0 ? 1 : -1;
}

/** Fischer-projekció: C1 felül (0,0,0), a lánc lefelé halad a képernyő síkjában. */
export function fischerLayout({ X3, el, adj, carbons, inUnit, out, placed }) {
  const n = carbons.length;
  carbons.forEach((c, i) => { put(out, c, [0, -i * LCC, 0]); placed[c] = 1; });
  const ctx = {
    X3, el, adj, out, placed, inUnit, side: [1, 0, 0], side3: [1, 0, 0], up3: [0, 1, 0],
    hdir: [1, 0, 0], sideDir: (s) => [s, 0, 0],
  };
  const todo = [];
  carbons.forEach((c, i) => {
    if (i === 0 || i === n - 1) {
      todo.push([c, n > 1 ? carbons[i === 0 ? 1 : n - 2] : -1, i === 0 ? UPV : DOWNV]);
      return;
    }
    const kids = adj[c].filter((x) => !carbons.includes(x) && inUnit(x) && !placed[x]);
    const sp = get(out, c);
    const heavy = kids.filter((x) => el[x] !== "H"), hs = kids.filter((x) => el[x] === "H");
    const set = (x, s) => { put(out, x, add(sp, [s * (el[x] === "H" ? LH : LX), 0, 0])); placed[x] = 1; todo.push([x, c, [s, 0, 0]]); };
    if (heavy.length === 1 && hs.length === 1) {
      const s = fischerSide(X3, carbons[i - 1], c, carbons[i + 1], heavy[0]);
      set(heavy[0], s);
      set(hs[0], -s);
    } else {
      kids.forEach((x, k) => set(x, k === 0 ? 1 : -1));
    }
  });
  for (const [x, p, d] of todo) branch(ctx, x, p, d);
}

// ---- segédek ------------------------------------------------------------------------
function subtreeFrom(adj, start, block, allow) {
  // a start-ból elérhető atomok (start nélkül), a block atomon át nem megyünk
  const seen = new Set([start, block]);
  const out = [];
  const q = [start];
  while (q.length) {
    const a = q.shift();
    for (const b of adj[a]) {
      if (seen.has(b) || !allow(b)) continue;
      seen.add(b);
      out.push(b);
      q.push(b);
    }
  }
  return out;
}
function signedAngle(from, to, axis) {
  const a = unit(perp(from, axis)), b = unit(perp(to, axis));
  return Math.atan2(dot(cross(a, b), axis), dot(a, b));
}
function checkAll(P, placed, N) {
  for (let i = 0; i < N; i++) if (!placed[i]) throw new Error(`papírmodell: a(z) ${i}. atom kimaradt`);
}

// Időzítés a papír-animációhoz
export const PAPER_T = {
  rot: [0, 0.16], // a Fischer-projekció elforgatása
  bend: [0.16, 0.5], // a lánc gyűrűvé hajlítása
  twist: [0.5, 0.72], // elfordulás a gyűrű-O-t hordozó C körül
  bond: [0.7, 0.82], // új C–O kötés
  hop: [0.82, 0.96], // H átkerülése
};

function closureFrames({ N, K0, K1, K3, sub: subtree, axis, pivot, theta, tH, tHk3, ringForm }) {
  const T = PAPER_T;
  // K2: a K3 a gyűrű-O-t hordozó C körül visszaforgatva
  const rotated = (ang) => {
    const Q = Float64Array.from(K3);
    put(Q, tH, tHk3);
    for (const i of subtree) put(Q, i, add(pivot, rotAxis(sub(get(Q, i), pivot), axis, ang)));
    return Q;
  };
  const K2 = rotated(theta);
  const bendStart = K1 ? T.rot[1] : 0;
  return function frame(t, out = new Float64Array(N * 3)) {
    if (t <= 0) { out.set(K0); return out; }
    if (t >= 1) { out.set(K3); return out; }
    if (K1 && t < T.rot[1]) {
      const a = (-Math.PI / 2) * ease(t / T.rot[1]);
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < N; i++) {
        const x = K0[3 * i], y = K0[3 * i + 1];
        out[3 * i] = x * c - y * s;
        out[3 * i + 1] = x * s + y * c;
        out[3 * i + 2] = K0[3 * i + 2];
      }
      return out;
    }
    if (t < T.bend[1]) {
      const s = ease((t - bendStart) / (T.bend[1] - bendStart));
      const A = K1 || K0;
      for (let i = 0; i < 3 * N; i++) out[i] = A[i] + (K2[i] - A[i]) * s;
      return out;
    }
    const s = ease((t - T.twist[0]) / (T.twist[1] - T.twist[0]));
    const Q = rotated(theta * (1 - s));
    out.set(Q);
    const w = smooth(T.hop[0], T.hop[1], t);
    if (w > 0) {
      let hp = lerp3(get(Q, tH), get(K3, tH), w);
      if (w < 1 && ringForm) {
        const c = centroid(K3, ringForm);
        const mid = lerp3(get(Q, tH), get(K3, tH), 0.5);
        hp = add(hp, mul(unit(sub(mid, c)), 0.5 * Math.sin(Math.PI * w)));
      }
      put(out, tH, hp);
    }
    return out;
  };
}

function closureBonds(bo, br, tH) {
  const T = PAPER_T;
  const r = (t) => smooth(T.bond[0], T.bond[1], t);
  const w = (t) => smooth(T.hop[0], T.hop[1], t);
  return bondUnion(bo, br).map((b) => {
    const hb = b.i === tH || b.j === tH;
    let alpha, second;
    if (b.oA && b.oB) {
      alpha = () => 1;
      if (b.oA === 2 && b.oB === 2) second = () => 1;
      else if (b.oA === 2) second = (t) => 1 - r(t);
      else second = () => 0;
    } else if (b.oA) {
      alpha = hb ? (t) => 1 - w(t) : (t) => 1 - r(t);
      second = b.oA === 2 ? alpha : () => 0;
    } else {
      alpha = hb ? w : r;
      second = () => 0;
    }
    return { i: b.i, j: b.j, alpha, second };
  });
}

function twistParams(K3, adjOpen, Ck, Ckm1, Ok, sideOk, allow) {
  // a C_k szubsztituensei (a nyílt lánc gráfjában), C_(k−1) felé nem megyünk
  const subtree = subtreeFrom(adjOpen, Ck, Ckm1, allow);
  const axis = unit(sub(get(K3, Ck), get(K3, Ckm1)));
  const pivot = get(K3, Ck);
  let theta = 0;
  if (sideOk !== 0) theta = signedAngle(sub(get(K3, Ok), pivot), [0, sideOk, 0], axis);
  return { subtree, axis, pivot, theta };
}

// ---- monoszacharid: Fischer → Haworth -----------------------------------------------------
/**
 * @param o.el, o.bo, o.br  elemek, nyílt és gyűrűs kötések
 * @param o.X3o, o.X3r      3D koordináták (nyílt, gyűrűs)
 * @param o.ring, o.ringType, o.carbons, o.tH, o.tHo ([O_k, C_k, C_k−1]), o.aO
 */
export function makePaperClosure(o) {
  const { el, bo, br, X3o, X3r, ring, ringType, carbons, tH, tHo } = o;
  const N = el.length;
  const all = () => true;
  const adjO = adjacency(N, bo), adjR = adjacency(N, br);
  const K3 = new Float64Array(N * 3), p3 = new Uint8Array(N);
  haworthLayout({ X3: X3r, el, adj: adjR, ring, ringType, inUnit: all, out: K3, placed: p3 });
  checkAll(K3, p3, N);
  const F = new Float64Array(N * 3), pF = new Uint8Array(N);
  fischerLayout({ X3: X3o, el, adj: adjO, carbons, inUnit: all, out: F, placed: pF });
  checkAll(F, pF, N);
  // középre: a gyűrűt alkotó szénatomok közepe kerüljön az origóba
  const ringC = ring.slice(0, -1);
  const cF = centroid(F, ringC);
  const K0 = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) put(K0, i, sub(get(F, i), cF));
  const K1 = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) { const [x, y, z] = get(K0, i); put(K1, i, [y, -x, z]); }
  const [Ok, Ck, Ckm1] = tHo;
  const v = sub(get(F, Ok), get(F, Ck));
  const sideOk = Math.abs(v[0]) > Math.abs(v[1]) ? (v[0] > 0 ? -1 : 1) : 0;
  const tw = twistParams(K3, adjO, Ck, Ckm1, Ok, sideOk, all);
  const c3 = centroid(K3, ring);
  const tHk3 = add(get(K3, Ok), mul(unit(perp(sub(get(K3, Ok), c3), UPV)), LH));
  const frame = closureFrames({ N, K0, K1, K3, sub: tw.subtree, axis: tw.axis, pivot: tw.pivot, theta: tw.theta, tH, tHk3, ringForm: ring });
  return { N, frame, bonds: closureBonds(bo, br, tH), atomAlpha: () => 1, twisted: Math.abs(tw.theta) > 0.05, paper: true };
}

/** Gyűrűt nem képező molekula: csak Fischer-projekció. */
export function makePaperFischer({ el, bo, X3o, carbons }) {
  const N = el.length;
  const F = new Float64Array(N * 3), pF = new Uint8Array(N);
  fischerLayout({ X3: X3o, el, adj: adjacency(N, bo), carbons, inUnit: () => true, out: F, placed: pF });
  checkAll(F, pF, N);
  const c = centroid(F, carbons);
  for (let i = 0; i < N; i++) put(F, i, sub(get(F, i), c));
  return {
    N,
    frame: (t, out = new Float64Array(N * 3)) => { out.set(F); return out; },
    bonds: bo.map(([i, j, o2]) => ({ i, j, alpha: () => 1, second: o2 === 2 ? () => 1 : () => 0 })),
    atomAlpha: () => 1,
    paper: true,
  };
}

// ---- diszacharidok -------------------------------------------------------------------
const ringTypeOf = (ring) => (ring.length === 6 ? "p" : "f");

/**
 * Két egység Haworth-képlete egymás mellett: az első (A) balra, a második (B)
 * jobbra úgy elforgatva (függőleges tengely körül), hogy a kapcsolódó
 * szénatomja A felé nézzen. A glikozidos O a két szénatom között van.
 */
function joinedLayout({ X3, el, adj, side, ringA, ringB, aCA, Ox, Cx, out, placed, joinBridge = true }) {
  const inA = (i) => side[i] === 0, inB = (i) => side[i] === 1;
  const infoA = haworthLayout({ X3, el, adj, ring: ringA, ringType: ringTypeOf(ringA), inUnit: inA, out, placed });
  const base = ringTypeOf(ringB) === "p" ? PYR : FUR;
  let j = ringB.indexOf(Cx);
  if (j < 0) j = ringB.indexOf(adj[Cx].find((n) => ringB.includes(n)));
  const yaw = 180 - base[j];
  const tmpPlaced = new Uint8Array(placed.length);
  const B = new Float64Array(out.length);
  haworthLayout({ X3, el, adj, ring: ringB, ringType: ringTypeOf(ringB), inUnit: inB, out: B, placed: tmpPlaced, yaw });
  const PA = get(out, aCA);
  const bA0 = infoA.bridge.find((b) => b.from === aCA);
  const dA0 = bA0 ? bA0.dir : -1;
  const exoCx = !ringB.includes(Cx);
  // gyűrűatomhoz kapcsolódó híd: a két szénatom egy magasságban, köztük az O;
  // gyűrűn kívüli (pl. C6) kapcsolódás: B a saját O-jánál fogva lóg A-ról
  const delta = exoCx
    ? sub(add(PA, [1.2, 0.8 * dA0, 0]), get(B, Ox))
    : sub(add(PA, [2.6, 0, 0]), get(B, Cx));
  for (let i = 0; i < placed.length; i++) {
    if (!tmpPlaced[i]) continue;
    put(out, i, add(get(B, i), delta));
    placed[i] = 1;
  }
  const bA = infoA.bridge.find((b) => b.from === aCA);
  const dA = bA ? bA.dir : -1;
  const dB = Math.sign(get(out, Ox)[1] - get(out, Cx)[1]) || -1;
  if (joinBridge && !exoCx) {
    const mid = lerp3(PA, get(out, Cx), 0.5);
    put(out, Ox, add(mid, [0, dA === dB ? dA * 0.9 : 0, 0]));
    placed[Ox] = 1;
  }
  return { dA, dB, yaw, delta };
}

function centerAll(arrs, N) {
  const c = centroid(arrs[0], [...Array(N).keys()]);
  for (const A of arrs) for (let i = 0; i < A.length / 3; i++) put(A, i, sub(get(A, i), c));
}

function unitCarbons(lab, bb, side, u) {
  const out = [];
  lab.forEach((l, i) => {
    if (!bb[i] || side[i] !== u) return;
    const m = /^C(\d+)/.exec(l);
    if (m) out[+m[1] - 1] = i;
  });
  return out.filter((x) => x !== undefined);
}

/** Diszacharid a redukáló vég gyűrűzáródásával (A Haworth, B Fischer → Haworth). */
export function makePaperClosureDi(o) {
  const { el, lab, bb, bo, br, X3o, X3r, ringA, ringB, side, newBond, tH, tHo } = o;
  const N = br.reduce((m, [i, j]) => Math.max(m, i, j), 0) + 1;
  const [aCA, Ox] = newBond;
  const adjO = adjacency(N, bo), adjR = adjacency(N, br);
  const Cx = adjR[Ox].find((n) => side[n] === 1 && el[n] === "C");
  const K3 = new Float64Array(N * 3), p3 = new Uint8Array(N);
  joinedLayout({ X3: X3r, el, adj: adjR, side, ringA, ringB, aCA, Ox, Cx, out: K3, placed: p3 });
  checkAll(K3, p3, N);
  // B Fischer-projekcióban; a két lehetséges állás (álló / 180°-kal elforgatott)
  // közül azt választjuk, amelyik kevésbé ütközik A-val.
  const carbons = unitCarbons(lab, bb, side, 1);
  const inB = (i) => side[i] === 1;
  const F = new Float64Array(N * 3), pF = new Uint8Array(N);
  fischerLayout({ X3: X3o, el, adj: adjO, carbons, inUnit: inB, out: F, placed: pF });
  for (let i = 0; i < N; i++) if (inB(i) && !pF[i]) throw new Error(`papírmodell: a(z) ${i}. atom kimaradt`);
  const bridge = get(K3, Ox);
  const Aidx = [...Array(N).keys()].filter((i) => side[i] === 0);
  const Bidx = [...Array(N).keys()].filter((i) => side[i] === 1);
  let best = null;
  for (const flip of [1, -1]) for (const tilt of [0, -15, 15, -30, 30]) {
    const C = Float64Array.from(K3);
    const a = (tilt * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const ox = get(F, Ox);
    for (const i of Bidx) {
      const [x, y, z] = mul(sub(get(F, i), ox), flip);
      put(C, i, add([x * ca - y * sa, x * sa + y * ca, z], bridge));
    }
    let clash = 0, mx = 0;
    for (const i of Bidx) {
      let dmin = 9;
      for (const a of Aidx) dmin = Math.min(dmin, len(sub(get(C, i), get(K3, a))));
      clash += Math.max(0, 2.4 - dmin) ** 2;
      mx += get(C, i)[0];
    }
    const score = clash - 0.001 * mx + 0.002 * Math.abs(tilt);
    if (!best || score < best.score) best = { score, C };
  }
  const K0 = best.C;
  centerAll([K3, K0], N);
  const [Ok, Ck, Ckm1] = tHo;
  const v = sub(get(F, Ok), get(F, Ck));
  let sideOk = Math.abs(v[0]) > Math.abs(v[1]) ? (v[0] > 0 ? -1 : 1) : 0;
  // 1→6 kötésnél a gyűrű-O-t hordozó C-hez a híd is kapcsolódik: nem forgatjuk
  if (twistParams(K3, adjO, Ck, Ckm1, Ok, 0, inB).subtree.includes(Ox)) sideOk = 0;
  const tw2 = twistParams(K3, adjO, Ck, Ckm1, Ok, sideOk, inB);
  const c3b = centroid(K3, ringB);
  const tHk3b = add(get(K3, Ok), mul(unit(perp(sub(get(K3, Ok), c3b), UPV)), LH));
  const frame = closureFrames({ N, K0, K1: null, K3, sub: tw2.subtree, axis: tw2.axis, pivot: tw2.pivot, theta: tw2.theta, tH, tHk3: tHk3b, ringForm: ringB });
  return { N, frame, bonds: closureBonds(bo, br, tH), atomAlpha: () => 1, twisted: Math.abs(tw2.theta) > 0.05, paper: true };
}

/** Diszacharid Haworth-képlete (mozdulatlan). */
export function makePaperDiStatic(o) {
  const { el, br, X3r, ringA, ringB, side, newBond } = o;
  const N = br.reduce((m, [i, j]) => Math.max(m, i, j), 0) + 1;
  const adjR = adjacency(N, br);
  const [aCA, Ox] = newBond;
  const Cx = adjR[Ox].find((n) => side[n] === 1 && el[n] === "C");
  const K3 = new Float64Array(N * 3), p3 = new Uint8Array(N);
  joinedLayout({ X3: X3r, el, adj: adjR, side, ringA, ringB, aCA, Ox, Cx, out: K3, placed: p3 });
  checkAll(K3, p3, N);
  centerAll([K3], N);
  return {
    N,
    frame: (t, out = new Float64Array(N * 3)) => { out.set(K3); return out; },
    bonds: br.map(([i, j, o2]) => ({ i, j, alpha: () => 1, second: o2 === 2 ? () => 1 : () => 0 })),
    atomAlpha: () => 1,
    paper: true,
  };
}

/**
 * A kondenzáció papírmodellje: két különálló Haworth-képlet, majd
 * összekapcsolódás és vízkilépés. A makeCondensation bemenetét állítja elő.
 */
export function paperCondensationInput(o) {
  const { el, b, X3r, X3free, ringA, ringB, side, newBond, gBonds } = o;
  const N = b.reduce((m, [i, j]) => Math.max(m, i, j), 0) + 1;
  const M = N + 3;
  const [aCA, Ox] = newBond;
  const adjR = adjacency(N, b);
  const Cx = adjR[Ox].find((n) => side[n] === 1 && el[n] === "C");
  const fin = new Float64Array(N * 3), pf = new Uint8Array(N);
  const J = joinedLayout({ X3: X3r, el, adj: adjR, side, ringA, ringB, aCA, Ox, Cx, out: fin, placed: pf });
  checkAll(fin, pf, N);
  // különálló egységek: a híd helyett a saját OH-csoportjaik
  const bondsFree = b.filter(([i, j]) => !((i === aCA && j === Ox) || (i === Ox && j === aCA)))
    .concat(gBonds.filter((g) => g[2] !== 2).map(([i, j]) => [i, j, 1]));
  const adjF = adjacency(M, bondsFree);
  const free = new Float64Array(M * 3), pfr = new Uint8Array(M);
  const inA = (i) => side[i] === 0, inB = (i) => side[i] === 1;
  haworthLayout({ X3: X3free, el, adj: adjF, ring: ringA, ringType: ringTypeOf(ringA), inUnit: inA, out: free, placed: pfr });
  const Bf = new Float64Array(M * 3), pB = new Uint8Array(M);
  haworthLayout({ X3: X3free, el, adj: adjF, ring: ringB, ringType: ringTypeOf(ringB), inUnit: inB, out: Bf, placed: pB, yaw: J.yaw });
  for (let i = 0; i < M; i++) if (pB[i]) { put(free, i, add(get(Bf, i), J.delta)); pfr[i] = 1; }
  checkAll(free, pfr, M);
  // a kilépő víz útja: a glikozidos O irányában távolodik
  const dW = J.dA || -1;
  const ob = get(fin, Ox);
  const water = (c) => [c, add(c, [0.76, 0.59 * dW, 0]), add(c, [-0.76, 0.59 * dW, 0])];
  const gMid = water(add(ob, [0, 2.3 * dW, 0.7]));
  const gEnd = water(add(ob, [0, 6.5 * dW, 2.8]));
  // középre igazítás (fin alapján)
  const c = centroid(fin, [...Array(N).keys()]);
  const shift = (P, n) => { for (let i = 0; i < n; i++) put(P, i, sub(get(P, i), c)); };
  shift(fin, N);
  shift(free, M);
  const gm = new Float64Array(9), ge = new Float64Array(9);
  gMid.forEach((p, k) => put(gm, k, sub(p, c)));
  gEnd.forEach((p, k) => put(ge, k, sub(p, c)));
  return { free, fin, u: [1, 0, 0], gMid: gm, gEnd: ge };
}

// ---- illesztés (hologramhoz) ------------------------------------------------------------
function jacobiMax(A) {
  const a = A.map((r) => r.slice());
  const V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 40; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(a[p][q]) < 1e-14) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let m = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[m][m]) m = i;
  return [V[0][m], V[1][m], V[2][m], V[3][m]];
}

/** A Mov koordinátákat merev mozgással a Ref-re illeszti (idx atomjai alapján). */
export function alignOnto(Mov, Ref, idx, out = new Float64Array(Mov.length)) {
  const cm = centroid(Mov, idx), cr = centroid(Ref, idx);
  const Sx = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of idx) {
    const m = sub(get(Mov, i), cm), r = sub(get(Ref, i), cr);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Sx[a][b] += m[a] * r[b];
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = Sx;
  const Nm = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const [w, x, y, z] = jacobiMax(Nm);
  for (let i = 0; i < Mov.length / 3; i++) {
    const v = sub(get(Mov, i), cm);
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    const r = [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    put(out, i, add(r, cr));
  }
  return out;
}
