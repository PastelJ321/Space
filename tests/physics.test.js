import test from "node:test";
import assert from "node:assert/strict";
import {
  FUELS,
  MODEL,
  simulate,
  sample,
  escapeThreshold,
} from "../src/physics.js";

const near = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: ${actual} vs ${expected}`,
  );

test("무중력에서 수치 적분은 로켓 방정식과 일치한다 (연소 경계 포함)", () => {
  for (const fuel of Object.keys(FUELS)) {
    for (const fraction of [0.75, 0.86, 0.95]) {
      const run = simulate(fuel, fraction, { mu: 0 });
      near(run.cutoff.v, run.ideal, 0.0001, `${fuel} ${fraction} cutoff Δv`);
      near(sample(run, 350).v, run.ideal, 0.0001, "coasting Δv");
    }
  }
});

test("관성 비행에서 역학적 에너지가 보존된다", () => {
  for (const fuel of Object.keys(FUELS))
    for (const fraction of [0.75, 0.95]) {
      const run = simulate(fuel, fraction);
      for (const time of [180, 220, 300, 350]) {
        const row = sample(run, time);
        const energy = row.v ** 2 / 2 - MODEL.mu / (MODEL.radius + row.h);
        near(energy, run.energy, 0.001, `${fuel} energy at ${time}`);
      }
    }
});

test("시간 간격을 절반으로 줄여도 결과가 수렴한다", () => {
  for (const fuel of Object.keys(FUELS)) {
    const run = simulate(fuel, 0.95),
      finer = simulate(fuel, 0.95, { step: 0.125 });
    near(run.cutoff.v, finer.cutoff.v, 0.0001, "cutoff velocity");
    near(sample(run, 350).h, sample(finer, 350).h, 0.001, "final altitude");
  }
});

test("질량은 연소 시간 동안 감소하고 이후 건조 질량을 유지한다", () => {
  const run = simulate("ch4", 0.86);
  for (const row of run.rows) {
    near(
      row.m,
      MODEL.initialMass * (1 - 0.86 * Math.min(row.t / MODEL.burnTime, 1)),
      1e-8,
      "mass",
    );
    assert.ok(row.h >= 0 && Number.isFinite(row.v));
  }
  near(run.cutoff.m, run.dryMass, 1e-8, "cutoff mass");
});

test("탈출 판정은 연소 종료 에너지를 사용하며 이후 속도가 11.2 km/s 아래여도 유효하다", () => {
  assert.equal(simulate("rp1", 0.95).escape, false);
  assert.equal(simulate("ch4", 0.95).escape, false);
  const run = simulate("lh2", 0.95);
  assert.ok(run.energy > 0 && run.escape);
  const final = sample(run, 350);
  assert.ok(final.v < 11200);
  assert.ok(final.v > Math.sqrt((2 * MODEL.mu) / (MODEL.radius + final.h)));
  assert.equal(simulate("lh2", 0.9).escape, false);
});

test("전체 입력 범위에서 비추력과 질량 비율 증가가 이상적 Δv 및 연소 종료 속도를 증가시킨다", () => {
  for (let percent = 75; percent <= 95; percent++) {
    const runs = Object.keys(FUELS).map((fuel) =>
      simulate(fuel, percent / 100),
    );
    assert.ok(runs[0].ideal < runs[1].ideal && runs[1].ideal < runs[2].ideal);
    assert.ok(
      runs[0].cutoff.v < runs[1].cutoff.v &&
        runs[1].cutoff.v < runs[2].cutoff.v,
    );
    for (const run of runs) assert.ok(run.cutoff.v < run.ideal);
  }
});

test("보간은 관측 시작과 끝을 유지하고 유효하지 않은 입력은 거부한다", () => {
  const run = simulate("rp1", 0.86);
  assert.deepEqual(sample(run, -10), { ...run.rows[0], phase: "ready" });
  assert.ok(sample(run, 400).h > sample(run, 350).h);
  const mid = sample(run, 0.125);
  near(
    mid.h,
    (run.rows[0].h + run.rows[1].h) / 2,
    1e-10,
    "interpolated altitude",
  );
  for (const fraction of [0.74, 0.991, NaN, Infinity])
    assert.throws(() => simulate("rp1", fraction), RangeError);
  assert.throws(() => simulate("unknown", 0.86), RangeError);
  assert.throws(() => simulate("rp1", 0.86, { step: 0 }), RangeError);
});

test("350초 이후에도 비행이 계속되며 최고점과 지표면 도달이 물리적으로 계산된다", () => {
  const run = simulate("rp1", 0.86);
  assert.ok(run.apogeeTime > 350 && run.impactTime > run.apogeeTime);
  const apex = sample(run, run.apogeeTime);
  near(apex.v, 0, 0.000001, "apogee velocity");
  near(apex.h, run.maxAltitude, 0.0001, "apogee height");
  assert.equal(sample(run, run.apogeeTime + 1).phase, "descent");
  const impact = sample(run, run.impactTime + 100);
  assert.equal(impact.t, run.impactTime);
  assert.equal(impact.h, 0);
  assert.equal(impact.phase, "impact");
  assert.ok(impact.v < 0);
});

test("탈출 궤적은 임의 시간 상한 없이 전파되며 에너지가 보존된다", () => {
  const run = simulate("lh2", 0.95);
  assert.equal(run.impactTime, Infinity);
  let prev = run.cutoff.h;
  for (const t of [350, 1000, 10000, 100000, 1000000]) {
    const p = sample(run, t);
    assert.equal(p.t, t);
    assert.ok(p.h > prev && p.v > 0);
    prev = p.h;
    near(
      p.v ** 2 / 2 - MODEL.mu / (MODEL.radius + p.h),
      run.energy,
      0.01,
      "long-term energy",
    );
  }
});

test("추진제별 탈출 경계 탐색과 0.1% 단위 적용값을 검증한다", () => {
  for (const id of Object.keys(FUELS)) {
    const threshold = escapeThreshold(id);
    assert.ok(simulate(id, threshold.fraction).escape);
    assert.equal(simulate(id, threshold.fraction - 1e-7).escape, false);
    assert.ok(simulate(id, threshold.applicableFraction).escape);
    assert.ok(threshold.applicableFraction >= threshold.fraction);
    near(
      threshold.mass,
      threshold.fraction * MODEL.initialMass,
      1e-8,
      "threshold mass",
    );
    // The universal-variable solver must stay stable near the parabolic boundary.
    for (const delta of [-1e-8, 0, 1e-8]) {
      const run = simulate(id, threshold.fraction + delta),
        p = sample(run, 10000);
      assert.ok(Number.isFinite(p.h) && Number.isFinite(p.v));
      near(
        p.v ** 2 / 2 - MODEL.mu / (MODEL.radius + p.h),
        run.energy,
        0.05,
        "near-parabolic energy",
      );
    }
  }
});

test("시간 역순 조회와 배속 변경은 물리 결과와 저장 행 수에 영향을 주지 않는다", () => {
  const run = simulate("lh2", 0.95),
    n = run.rows.length;
  const a = sample(run, 10000);
  sample(run, 1000000);
  sample(run, 350);
  assert.deepEqual(sample(run, 10000), a);
  assert.equal(run.rows.length, n);
});
