// SI units. Isp values are engine assumptions for comparison, not fuel properties.
export const FUELS = Object.freeze({
  rp1: { name: "RP-1", isp: 320, color: "#d6aa81" },
  ch4: { name: "CH₄", isp: 370, color: "#84bfc6" },
  lh2: { name: "LH₂", isp: 450, color: "#a8b9e5" },
});
export const MODEL = Object.freeze({
  mu: 3.986004418e14,
  radius: 6371000,
  g0: 9.80665,
  initialMass: 120000,
  burnTime: 180,
  step: 0.25,
  minFraction: 0.75,
  maxFraction: 0.99,
});

export function simulate(
  fuelId,
  fraction,
  { step = MODEL.step, mu = MODEL.mu } = {},
) {
  if (
    !FUELS[fuelId] ||
    !Number.isFinite(fraction) ||
    fraction < MODEL.minFraction ||
    fraction > MODEL.maxFraction
  )
    throw new RangeError("Invalid experiment conditions");
  if (
    !Number.isFinite(step) ||
    step <= 0 ||
    step > 1 ||
    !Number.isFinite(mu) ||
    mu < 0
  )
    throw new RangeError("Invalid integration settings");
  const { initialMass, burnTime, g0, radius } = MODEL;
  const isp = FUELS[fuelId].isp,
    dryMass = initialMass * (1 - fraction);
  const massFlow = (initialMass * fraction) / burnTime,
    exhaustVelocity = isp * g0;
  const massAt = (t) => Math.max(dryMass, initialMass - massFlow * t);
  const rows = [{ t: 0, h: 0, v: 0, m: initialMass }];
  let t = 0,
    h = 0,
    v = 0;
  while (t < burnTime - 1e-9) {
    // Every stage samples the powered side of the exact cutoff boundary.
    const ds = Math.min(step, burnTime - t);
    const acc = (time, alt) =>
      (massFlow * exhaustVelocity) / massAt(time) -
      mu / (radius + Math.max(0, alt)) ** 2;
    const k1h = v,
      k1v = acc(t, h);
    const k2h = v + (k1v * ds) / 2,
      k2v = acc(t + ds / 2, h + (k1h * ds) / 2);
    const k3h = v + (k2v * ds) / 2,
      k3v = acc(t + ds / 2, h + (k2h * ds) / 2);
    const k4h = v + k3v * ds,
      k4v = acc(t + ds, h + k3h * ds);
    h += (ds * (k1h + 2 * k2h + 2 * k3h + k4h)) / 6;
    v += (ds * (k1v + 2 * k2v + 2 * k3v + k4v)) / 6;
    t = Math.min(burnTime, t + ds);
    if (h < 0) {
      h = 0;
      v = 0;
    }
    rows.push({ t, h, v, m: massAt(t) });
  }
  const cutoff = rows.at(-1),
    r0 = radius + cutoff.h;
  const energy = cutoff.v ** 2 / 2 - mu / r0;
  const run = {
    fuelId,
    fraction,
    isp,
    mu,
    dryMass,
    massFlow,
    exhaustVelocity,
    rows,
    cutoff,
    energy,
    escape: cutoff.v > 0 && energy >= 0,
    ideal: exhaustVelocity * Math.log(initialMass / dryMass),
    ratio: initialMass / dryMass,
    impactTime: Infinity,
    apogeeTime: Infinity,
    maxAltitude: Infinity,
  };
  if (mu > 0 && energy < 0) {
    const a = -mu / (2 * energy),
      eta0 = Math.acos(Math.max(-1, Math.min(1, 1 - r0 / a)));
    const etaGround = 2 * Math.PI - Math.acos(1 - radius / a);
    const scale = Math.sqrt(a ** 3 / mu);
    run.apogeeTime = burnTime + scale * (Math.PI - eta0 + Math.sin(eta0));
    run.impactTime =
      burnTime +
      scale * (etaGround - Math.sin(etaGround) - eta0 + Math.sin(eta0));
    run.maxAltitude = 2 * a - radius;
  }
  return run;
}

// Stumpff functions retain precision on both sides of the parabolic boundary.
function stumpff(z) {
  if (Math.abs(z) < 1e-3)
    return [
      0.5 - z / 24 + z ** 2 / 720 - z ** 3 / 40320 + z ** 4 / 3628800,
      1 / 6 - z / 120 + z ** 2 / 5040 - z ** 3 / 362880 + z ** 4 / 39916800,
    ];
  const q = Math.sqrt(Math.abs(z));
  return z > 0
    ? [(1 - Math.cos(q)) / z, (q - Math.sin(q)) / q ** 3]
    : [(Math.cosh(q) - 1) / -z, (Math.sinh(q) - q) / q ** 3];
}

function coast(run, time) {
  const { cutoff, mu, dryMass } = run;
  const dt = time - MODEL.burnTime,
    r0 = MODEL.radius + cutoff.h,
    v0 = cutoff.v;
  if (mu === 0)
    return {
      t: time,
      h: cutoff.h + v0 * dt,
      v: v0,
      m: dryMass,
      phase: "coast",
    };
  const sqrtMu = Math.sqrt(mu),
    alpha = (-2 * run.energy) / mu;
  const target = sqrtMu * dt,
    radial = (r0 * v0) / sqrtMu;
  const equation = (chi) => {
    const [c, s] = stumpff(alpha * chi * chi);
    return radial * chi * chi * c + (1 - alpha * r0) * chi ** 3 * s + r0 * chi;
  };
  let lo = 0,
    hi = Math.max(1, Math.min(target / r0, 100000));
  while (equation(hi) < target) hi *= 2;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (equation(mid) < target) lo = mid;
    else hi = mid;
  }
  const chi = (lo + hi) / 2,
    [c, s] = stumpff(alpha * chi * chi);
  const f = 1 - ((chi * chi) / r0) * c,
    g = dt - (chi ** 3 / sqrtMu) * s;
  const r = f * r0 + g * v0;
  const fdot = (sqrtMu / (r * r0)) * (alpha * chi ** 3 * s - chi);
  const gdot = 1 - ((chi * chi) / r) * c;
  const v = fdot * r0 + gdot * v0;
  return {
    t: time,
    h: Math.max(0, r - MODEL.radius),
    v,
    m: dryMass,
    phase: v < -1e-5 ? "descent" : "coast",
  };
}

export function sample(run, time) {
  if (!Number.isFinite(time)) throw new RangeError("Invalid observation time");
  const t = Math.max(0, Math.min(run.impactTime, time));
  if (t > MODEL.burnTime) {
    const point = coast(run, t);
    if (t >= run.impactTime) return { ...point, h: 0, phase: "impact" };
    return point;
  }
  const rows = run.rows;
  let lo = 0,
    hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = rows[lo],
    b = rows[hi],
    q = (t - a.t) / (b.t - a.t);
  return {
    t,
    h: a.h + (b.h - a.h) * q,
    v: a.v + (b.v - a.v) * q,
    m: a.m + (b.m - a.m) * q,
    phase: t === 0 ? "ready" : t < MODEL.burnTime ? "burn" : "coast",
  };
}

const thresholds = new Map();
export function escapeThreshold(fuelId) {
  if (thresholds.has(fuelId)) return thresholds.get(fuelId);
  let lo = MODEL.minFraction,
    hi = MODEL.maxFraction;
  if (!simulate(fuelId, hi).escape) return null;
  for (let i = 0; i < 33; i++) {
    const mid = (lo + hi) / 2;
    if (simulate(fuelId, mid).escape) hi = mid;
    else lo = mid;
  }
  const result = {
    fraction: hi,
    mass: hi * MODEL.initialMass,
    applicableFraction: Math.ceil(hi * 1000) / 1000,
  };
  thresholds.set(fuelId, result);
  return result;
}
