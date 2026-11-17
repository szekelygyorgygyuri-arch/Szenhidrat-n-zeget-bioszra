// Szénhidrát 3D – kinematika
// ---------------------------------------------------------------------------
// A gyűrűzáródás és a glikozidos kötés kialakulásának geometriája.
// Független a megjelenítéstől (nincs benne Three.js), ezért Node-ban is
// tesztelhető.
//
// Gyűrűzáródás: a nyílt láncú és a gyűrűs konformer ugyanazokból az atomokból
// áll, azonos sorrendben. Egy feszítőfán (a nyílt lánc kötései) belső
// koordinátákat (kötéshossz, kötésszög, torziós szög) számolunk mindkét
// állapotra, és ezeket interpoláljuk. Az elágazó atomoknál a testvér-atomok
// torzióját az első testvérhez viszonyítjuk, így a királis centrumok
// térállása az animáció alatt sem fordulhat át. Az anomer C-atom szubsztituensei
// (sp² → sp³) csak a záródás végén piramidalizálódnak, a gyűrű-O hidrogénje
// pedig a legvégén kerül át a karbonil-O-ra (glikozidos OH).

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const ease = (x) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const lerp = (a, b, s) => a + (b - a) * s;
const TAU = Math.PI * 2;
const wrap = (a) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
};

// ---- vektorok -------------------------------------------------------------
const get = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const put = (P, i, x) => {
  P[3 * i] = x[0];
  P[3 * i + 1] = x[1];
  P[3 * i + 2] = x[2];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const vlerp = (a, b, s) => [lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s)];

export function dist(P, i, j) {
  return len(sub(get(P, i), get(P, j)));
}
export function angle(P, i, j, k) {
  const a = unit(sub(get(P, i), get(P, j)));
  const b = unit(sub(get(P, k), get(P, j)));
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}
export function dihedral(P, a, b, c, d) {
  const p0 = get(P, a), p1 = get(P, b), p2 = get(P, c), p3 = get(P, d);
  const b0 = sub(p0, p1);
  const b1 = unit(sub(p2, p1));
  const b2 = sub(p3, p2);
  const v = sub(b0, mul(b1, dot(b0, b1)));
  const w = sub(b2, mul(b1, dot(b2, b1)));
  return Math.atan2(dot(cross(b1, v), w), dot(v, w));
}
// D elhelyezése: |CD| = R, ∠BCD = th, ABCD torzió = ph
function nerf(A, B, C, R, th, ph) {
  const bc = unit(sub(C, B));
  const n = unit(cross(sub(B, A), bc));
  const m = cross(n, bc);
  const d0 = -R * Math.cos(th), d1 = R * Math.sin(th) * Math.cos(ph), d2 = R * Math.sin(th) * Math.sin(ph);
  return [
    C[0] + bc[0] * d0 + m[0] * d1 + n[0] * d2,
    C[1] + bc[1] * d0 + m[1] * d1 + n[1] * d2,
    C[2] + bc[2] * d0 + m[2] * d1 + n[2] * d2,
  ];
}

// ---- kvaterniók -----------------------------------------------------------
function quatFromBasis(e1, e2, e3) {
  // oszlopok: e1, e2, e3
  const m00 = e1[0], m01 = e2[0], m02 = e3[0];
  const m10 = e1[1], m11 = e2[1], m12 = e3[1];
  const m20 = e1[2], m21 = e2[2], m22 = e3[2];
  const tr = m00 + m11 + m22;
  let w, x, y, z;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  return [x, y, z, w];
}
function slerp(a, b, t) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let c = ax * bx + ay * by + az * bz + aw * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0, k1;
  if (c > 0.9995) { k0 = 1 - t; k1 = t; } else {
    const o = Math.acos(c), so = Math.sin(o);
    k0 = Math.sin((1 - t) * o) / so; k1 = Math.sin(t * o) / so;
  }
  const q = [ax * k0 + bx * k1, ay * k0 + by * k1, az * k0 + bz * k1, aw * k0 + bw * k1];
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}
function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
function frameOf(P, r0, r1, r2) {
  const o = get(P, r0);
  const e1 = unit(sub(get(P, r1), o));
  const v = sub(get(P, r2), o);
  const e2 = unit(sub(v, mul(e1, dot(v, e1))));
  return { q: quatFromBasis(e1, e2, cross(e1, e2)), o };
}

// ---- kötések uniója két állapot között -------------------------------------
function bondUnion(bA, bB) {
  const key = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  const map = new Map();
  for (const [i, j, o] of bA) map.set(key(i, j), { i, j, oA: o, oB: 0 });
  for (const [i, j, o] of bB) {
    const k = key(i, j);
    if (map.has(k)) map.get(k).oB = o;
    else map.set(k, { i, j, oA: 0, oB: o });
  }
  return [...map.values()];
}

// Időzítés (t = 0 … 1)
export const TIMING = {
  curl: [0.02, 0.8], // váz-torziók
  rot: [0.0, 0.85], // a teljes molekula elfordulása
  late: [0.6, 0.84], // az anomer C sp² → sp³
  bond: [0.56, 0.74], // az új C–O kötés megjelenése, C=O → C–O
  hop: [0.8, 0.96], // a H átkerülése
};

/**
 * Gyűrűzáródás modellje.
 * @param o.Xo, o.Xr   nyílt és gyűrűs koordináták (megjelenítési keretben)
 * @param o.bo, o.br   kötéslisták [i, j, rend]
 * @param o.root       [r0, r1, r2] – a fa gyökere és két szomszédja
 * @param o.tH         a vándorló H indexe
 * @param o.tHo, o.tHr a H referenciaatomjai a nyílt (O_k, C_k, C_k-1) és a
 *                     gyűrűs (O_a, C_a, C_a+1) állapotban
 * @param o.aC         az anomer (karbonil) C-atom
 */
export function makeClosure(o) {
  const { Xo, Xr, bo, br, root, tH, tHo, tHr, aC } = o;
  const N = Xo.length / 3;
  const adj = Array.from({ length: N }, () => []);
  for (const [i, j] of bo) {
    if (i === tH || j === tH) continue;
    adj[i].push(j);
    adj[j].push(i);
  }
  const [r0, r1, r2] = root;
  const parent = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const order = [r0, r1, r2];
  seen[r0] = seen[r1] = seen[r2] = 1;
  seen[tH] = 1;
  parent[r1] = r0;
  parent[r2] = r0;
  const queue = [r0, r1, r2];
  while (queue.length) {
    const a = queue.shift();
    for (const b of adj[a]) {
      if (!seen[b]) {
        seen[b] = 1;
        parent[b] = a;
        order.push(b);
        queue.push(b);
      }
    }
  }
  if (order.length !== N - 1) throw new Error("A kötésgráf nem összefüggő");
  const placed = new Uint8Array(N);
  placed[r0] = placed[r1] = placed[r2] = 1;
  const firstNb = (x, ex) => {
    for (const y of adj[x]) if (placed[y] && !ex.includes(y)) return y;
    return -1;
  };
  const refs = [];
  const refIndex = new Int32Array(N).fill(-1);
  const leadOf = new Map();
  for (let n = 3; n < order.length; n++) {
    const a = order[n], p = parent[a];
    const g = parent[p] >= 0 ? parent[p] : firstNb(p, [a]);
    let h = parent[g] >= 0 && parent[g] !== p ? parent[g] : firstNb(g, [a, p]);
    if (h < 0) h = firstNb(p, [a, g]);
    const key = `${p},${g},${h}`;
    let lead = -1;
    if (leadOf.has(key)) lead = leadOf.get(key);
    else leadOf.set(key, a);
    refIndex[a] = refs.length;
    refs.push({ a, p, g, h, lead, late: p === aC });
    placed[a] = 1;
  }
  // Az ugyanahhoz az atomhoz kötött H-atomok (CH₂, CH₃, NH₂) felcserélhetők.
  // A gyűrűs állapotban úgy rendeljük őket egymáshoz, hogy a lehető
  // legkisebbet forduljanak – különben interpoláció közben átmennének
  // egymáson.
  const XrP = Float64Array.from(Xr);
  {
    const kids = new Map();
    for (const r of refs) {
      if (!o.el || o.el[r.a] !== "H" || adj[r.a].length !== 1) continue;
      if (!kids.has(r.p)) kids.set(r.p, []);
      kids.get(r.p).push(r);
    }
    const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) =>
      perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
    for (const list of kids.values()) {
      if (list.length < 2) continue;
      // Az interpoláció a "vezető" testvér torzióját és a többiek ehhez mért
      // eltolását követi; a költség a testvérek egymáshoz képesti elmozdulása.
      const dO = list.map((r) => dihedral(Xo, r.h, r.g, r.p, r.a));
      const dR = list.map((r) => dihedral(Xr, r.h, r.g, r.p, r.a));
      const r0_ = list[0];
      const leadAtom = r0_.lead >= 0 ? r0_.lead : r0_.a;
      const li = list.findIndex((r) => r.a === leadAtom);
      const lr = refs[refIndex[leadAtom]];
      const dOL = li >= 0 ? null : dihedral(Xo, lr.h, lr.g, lr.p, lr.a);
      const dRL = li >= 0 ? null : dihedral(Xr, lr.h, lr.g, lr.p, lr.a);
      let best = null, bestCost = Infinity;
      for (const p of perms(list.map((_, i) => i))) {
        const oL = li >= 0 ? dO[li] : dOL;
        const rL = li >= 0 ? dR[p[li]] : dRL;
        let c = 0.01 * Math.abs(wrap(rL - oL));
        for (let i = 0; i < p.length; i++) {
          if (i === li) continue;
          c += Math.abs(wrap((dR[p[i]] - rL) - (dO[i] - oL)));
        }
        if (c < bestCost) { bestCost = c; best = p; }
      }
      list.forEach((r, i) => put(XrP, r.a, get(Xr, list[best[i]].a)));
    }
  }

  const internals = (X) => {
    const I = refs.map((r) => ({
      b: dist(X, r.a, r.p),
      th: angle(X, r.g, r.p, r.a),
      d: dihedral(X, r.h, r.g, r.p, r.a),
    }));
    refs.forEach((r, n) => {
      if (r.lead >= 0) I[n].off = wrap(I[n].d - I[refIndex[r.lead]].d);
    });
    return {
      I,
      b01: dist(X, r0, r1),
      b02: dist(X, r0, r2),
      th: angle(X, r1, r0, r2),
      F: frameOf(X, r0, r1, r2),
      hO: { b: dist(X, tH, tHo[0]), th: angle(X, tHo[1], tHo[0], tH), d: dihedral(X, tHo[2], tHo[1], tHo[0], tH) },
      hR: { b: dist(X, tH, tHr[0]), th: angle(X, tHr[1], tHr[0], tH), d: dihedral(X, tHr[2], tHr[1], tHr[0], tH) },
    };
  };
  const S0 = internals(Xo), S1 = internals(XrP);
  const ringAtoms = o.ringForm || [];
  const T = TIMING;
  const sCurl = (t) => smooth(T.curl[0], T.curl[1], t);
  const sRot = (t) => smooth(T.rot[0], T.rot[1], t);
  const sLate = (t) => smooth(T.late[0], T.late[1], t);
  const rB = (t) => smooth(T.bond[0], T.bond[1], t);
  const wH = (t) => smooth(T.hop[0], T.hop[1], t);
  const curD = new Float64Array(refs.length);
  const tmp = new Float64Array(N * 3);

  function frame(t, out = new Float64Array(N * 3)) {
    if (t <= 0) { out.set(Xo); return out; }
    if (t >= 1) { out.set(XrP); return out; }
    const sc = sCurl(t), sl = sLate(t);
    const b01 = lerp(S0.b01, S1.b01, sc), b02 = lerp(S0.b02, S1.b02, sc), th0 = lerp(S0.th, S1.th, sc);
    put(tmp, r0, [0, 0, 0]);
    put(tmp, r1, [b01, 0, 0]);
    put(tmp, r2, [b02 * Math.cos(th0), b02 * Math.sin(th0), 0]);
    for (let n = 0; n < refs.length; n++) {
      const r = refs[n], A = S0.I[n], B = S1.I[n];
      const s = r.late ? sl : sc;
      let d;
      if (r.lead < 0) d = A.d + sc * wrap(B.d - A.d);
      else d = curD[refIndex[r.lead]] + A.off + s * wrap(B.off - A.off);
      curD[n] = d;
      put(tmp, r.a, nerf(get(tmp, r.h), get(tmp, r.g), get(tmp, r.p), lerp(A.b, B.b, s), lerp(A.th, B.th, s), d));
    }
    // a belső keretből a megjelenítési keretbe
    const sr = sRot(t);
    const q = slerp(S0.F.q, S1.F.q, sr);
    const org = vlerp(S0.F.o, S1.F.o, sr);
    for (let i = 0; i < N; i++) {
      if (i === tH) continue;
      put(out, i, add(qrot(q, get(tmp, i)), org));
    }
    // a vándorló H
    // a gyűrű-O hidrogénje elfordul a közeledő karbonil-C-től
    const dAnti = dihedral(out, tHo[2], tHo[1], tHo[0], aC) + Math.PI;
    const dOpen = S0.hO.d + smooth(0.2, 0.55, t) * wrap(dAnti - S0.hO.d);
    const ho = nerf(get(out, tHo[2]), get(out, tHo[1]), get(out, tHo[0]), S0.hO.b, S0.hO.th, dOpen);
    const hr = nerf(get(out, tHr[2]), get(out, tHr[1]), get(out, tHr[0]), S1.hR.b, S1.hR.th, S1.hR.d);
    const w = wH(t);
    let hp = vlerp(ho, hr, w);
    if (w > 0 && w < 1 && ringAtoms.length) {
      let c = [0, 0, 0];
      for (const i of ringAtoms) c = add(c, get(out, i));
      c = mul(c, 1 / ringAtoms.length);
      const mid = vlerp(get(out, tHo[0]), get(out, tHr[0]), 0.5);
      hp = add(hp, mul(unit(sub(mid, c)), 0.55 * Math.sin(Math.PI * w)));
    }
    put(out, tH, hp);
    return out;
  }

  const bonds = bondUnion(bo, br).map((b) => {
    const hb = b.i === tH || b.j === tH;
    let alpha, second;
    if (b.oA && b.oB) {
      alpha = () => 1;
      if (b.oA === 2 && b.oB === 2) second = () => 1;
      else if (b.oA === 2) second = (t) => 1 - rB(t);
      else if (b.oB === 2) second = (t) => rB(t);
      else second = () => 0;
    } else if (b.oA) {
      alpha = hb ? (t) => 1 - wH(t) : (t) => 1 - rB(t);
      second = b.oA === 2 ? alpha : () => 0;
    } else {
      alpha = hb ? (t) => wH(t) : (t) => rB(t);
      second = () => 0;
    }
    return { i: b.i, j: b.j, alpha, second };
  });
  return { N, frame, bonds, atomAlpha: () => 1, rB, wH, refs, ringX: XrP };
}

/**
 * Glikozidos kötés kialakulása (kondenzáció): két különálló gyűrűs
 * monoszacharid közelít, kilép egy vízmolekula, létrejön a C–O–C híd.
 */
export function makeCondensation(o) {
  const { free, fin, u, side, gMid, gEnd, newBond, gBonds, N, bonds: finalBonds } = o;
  const M = N + 3;
  const shiftAt = (t) =>
    t < 0.42 ? lerp(3.2, 1.0, ease(t / 0.42)) : t < 0.7 ? lerp(1.0, 0, ease((t - 0.42) / 0.28)) : 0;
  const ghostAlpha = (t) => 1 - smooth(0.8, 0.98, t);
  function frame(t, out = new Float64Array(M * 3)) {
    const S = shiftAt(t);
    const c = smooth(0.42, 0.7, t);
    for (let i = 0; i < M; i++) {
      const sh = mul(u, side[i] ? S : -S);
      const attached = add(get(free, i), sh);
      if (i < N) {
        put(out, i, add(vlerp(get(free, i), get(fin, i), c), sh));
      } else {
        const k = i - N;
        const gm = get(gMid, k), ge = get(gEnd, k);
        let p;
        if (t < 0.42) p = attached;
        else if (t < 0.7) p = vlerp(attached, gm, ease((t - 0.42) / 0.28));
        else p = vlerp(gm, ge, ease((t - 0.7) / 0.3));
        put(out, i, p);
      }
    }
    return out;
  }
  const nb = (a, b) => (newBond[0] === a && newBond[1] === b) || (newBond[0] === b && newBond[1] === a);
  const bonds = finalBonds.map(([i, j, o2]) => ({
    i, j,
    alpha: nb(i, j) ? (t) => smooth(0.55, 0.68, t) : () => 1,
    second: o2 === 2 ? () => 1 : () => 0,
  }));
  for (const [i, j, type] of gBonds) {
    let alpha;
    if (type === 0) alpha = (t) => 1 - smooth(0.44, 0.54, t);
    else if (type === 1) alpha = () => 1;
    else alpha = (t) => smooth(0.56, 0.66, t);
    bonds.push({ i, j, alpha, second: () => 0 });
  }
  const atomAlpha = (t, i) => (i >= N ? ghostAlpha(t) : 1);
  return { N: M, frame, bonds, atomAlpha };
}

/** Mozdulatlan modell (pl. gyűrűt nem képező triózok). */
export function makeStatic(X, bonds) {
  const N = X.length / 3;
  return {
    N,
    frame: (t, out = new Float64Array(N * 3)) => { out.set(X); return out; },
    bonds: bonds.map(([i, j, o2]) => ({ i, j, alpha: () => 1, second: o2 === 2 ? () => 1 : () => 0 })),
    atomAlpha: () => 1,
  };
}
