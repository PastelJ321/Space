import { FUELS, MODEL, simulate, sample, escapeThreshold } from "./physics.js";
import { FlightRenderer } from "./renderer.js";
import { renderComparison, exportReport } from "./report.js";

const el = (id) => document.getElementById(id);
const renderer = new FlightRenderer(el("scene"));
const number = (v, digits) =>
  v.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const state = {
  fuelId: "rp1",
  fraction: 0.86,
  elapsed: 0,
  status: "ready",
  rate: 12,
  run: null,
};
let raf = 0,
  previous = null,
  lastPaint = -Infinity;
if (renderer.mode === "2d")
  el("sceneCaption").textContent = "3D 미지원 · 2D 표시 · 로켓 확대";

function refresh() {
  const point = sample(state.run, state.elapsed);
  el("velVal").value = number(point.v / 1000, 3);
  const altitudeKm = point.h / 1000;
  el("altVal").value = number(
    altitudeKm >= 1e6 ? altitudeKm / 1e6 : altitudeKm,
    altitudeKm >= 1e4 && altitudeKm < 1e6 ? 0 : 2,
  );
  el("altUnit").textContent = altitudeKm >= 1e6 ? "백만 km" : "km";
  el("altVal").title = `${number(altitudeKm, 2)} km`;
  el("timeVal").value = number(
    point.t >= 3600 ? point.t / 3600 : point.t,
    point.t >= 3600 ? 2 : 1,
  );
  el("timeUnit").textContent = point.t >= 3600 ? " h" : " s";
  el("escapeSpeed").value = number(
    Math.sqrt((2 * MODEL.mu) / (MODEL.radius + point.h)) / 1000,
    3,
  );
  const remaining = Math.max(0, point.m - state.run.dryMass);
  el("remainingFuel").value = number(remaining / 1000, 1);
  el("fuelProgress").style.width =
    `${(remaining / (MODEL.initialMass * state.fraction)) * 100}%`;
  const phaseText =
    state.status === "paused"
      ? "일시 정지"
      : point.phase === "impact"
        ? "지표면 도달"
        : point.phase === "ready"
          ? "발사 전"
          : point.phase === "burn"
            ? point.t < 1.2
              ? "점화"
              : "추진 비행"
            : point.phase === "descent"
              ? "낙하"
              : "관성 상승";
  if (el("phaseText").textContent !== phaseText)
    el("phaseText").textContent = phaseText;
  document.querySelector(".phase").dataset.phase =
    state.status === "running" ? point.phase : state.status;
  el("burnLabel").textContent = remaining > 0.1 ? "남은 추진제" : "연소 종료";
  el("burnNote").textContent =
    point.t < MODEL.burnTime
      ? "연소 종료 180 s"
      : point.phase === "impact"
        ? "지표면 도달 · 충돌 이후는 계산하지 않음"
        : point.phase === "descent"
          ? "중력에 의한 하강"
          : "추가 추력 없이 비행 중";
  el("escapeLabel").textContent =
    point.t >= MODEL.burnTime ? "연소 종료 기준" : "연소 종료 예측";
  const labels = {
    running: "일시 정지",
    paused: "계속",
    impact: "다시 발사",
    ready: "발사",
  };
  el("launchLabel").textContent = labels[state.status];
  el("launchBtn")
    .querySelector("path")
    .setAttribute(
      "d",
      state.status === "running"
        ? "M6 4h3v12H6ZM12 4h3v12h-3Z"
        : "m7 4 8 6-8 6Z",
    );
  el("compareBtn").hidden = point.t < MODEL.burnTime;
  renderer.draw({ point, phase: point.phase, fuelId: state.fuelId });
}
function stopClock() {
  cancelAnimationFrame(raf);
  raf = 0;
  previous = null;
  lastPaint = -Infinity;
}
function reset() {
  stopClock();
  state.elapsed = 0;
  state.status = "ready";
  refresh();
}
function updateConditions() {
  state.run = simulate(state.fuelId, state.fraction);
  const threshold = escapeThreshold(state.fuelId);
  document.querySelectorAll(".fuel").forEach((button) => {
    const selected = button.dataset.fuel === state.fuelId;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  el("ispRead").textContent = FUELS[state.fuelId].isp;
  el("fractionValue").innerHTML =
    `${number(state.fraction * 100, 1)}<span>%</span>`;
  el("fraction").value = (state.fraction * 100).toFixed(1);
  el("fraction").style.setProperty(
    "--fill",
    `${((state.fraction - MODEL.minFraction) / (MODEL.maxFraction - MODEL.minFraction)) * 100}%`,
  );
  el("fraction").setAttribute(
    "aria-valuetext",
    `${number(state.fraction * 100, 1)}퍼센트`,
  );
  el("fuelMass").textContent = number(
    (state.fraction * MODEL.initialMass) / 1000,
    1,
  );
  el("massRatio").textContent = number(state.run.ratio, 2);
  el("dvVal").value = number(state.run.ideal / 1000, 3);
  el("cutoffVal").value = number(state.run.cutoff.v / 1000, 3);
  el("escapeValue").textContent = state.run.escape ? "탈출 가능" : "탈출 불가";
  el("escapeResult").classList.toggle("success", state.run.escape);
  el("thresholdFraction").value = number(threshold.fraction * 100, 2);
  el("thresholdMass").textContent = `${number(threshold.mass / 1000, 2)} t`;
  el("thresholdTick").style.left =
    `${((threshold.fraction - MODEL.minFraction) / (MODEL.maxFraction - MODEL.minFraction)) * 100}%`;
  el("applyThreshold").title =
    `${(threshold.applicableFraction * 100).toFixed(1)}% 적용`;
  reset();
}
function frame(now) {
  if (state.status !== "running" || document.hidden) {
    previous = null;
    return;
  }
  if (previous !== null)
    state.elapsed +=
      Math.max(0, Math.min((now - previous) / 1000, 0.1)) * state.rate;
  previous = now;
  if (state.elapsed >= state.run.impactTime) {
    state.elapsed = state.run.impactTime;
    state.status = "impact";
    stopClock();
    refresh();
    return;
  }
  // Explicit 30 fps presentation budget; the physical solution does not depend on fps.
  if (now - lastPaint >= 1000 / 30 - 0.5) {
    refresh();
    lastPaint = now;
  }
  raf = requestAnimationFrame(frame);
}
function launch() {
  if (state.status === "running") {
    stopClock();
    state.status = "paused";
    refresh();
    return;
  }
  if (state.status === "impact") state.elapsed = 0;
  state.status = "running";
  previous = null;
  refresh();
  raf = requestAnimationFrame(frame);
}
for (const button of document.querySelectorAll(".fuel"))
  button.addEventListener("click", () => {
    if (state.fuelId !== button.dataset.fuel) {
      state.fuelId = button.dataset.fuel;
      updateConditions();
    }
  });
el("fraction").addEventListener("input", (e) => {
  state.fraction = Number(e.target.value) / 100;
  updateConditions();
});
el("applyThreshold").addEventListener("click", () => {
  state.fraction = escapeThreshold(state.fuelId).applicableFraction;
  updateConditions();
});
el("playbackRate").addEventListener("change", (e) => {
  state.rate = Number(e.target.value);
});
el("launchBtn").addEventListener("click", launch);
el("resetBtn").addEventListener("click", reset);
document.addEventListener("visibilitychange", () => {
  stopClock();
  if (!document.hidden && state.status === "running")
    raf = requestAnimationFrame(frame);
});
window.addEventListener("pagehide", stopClock);
window.addEventListener("pageshow", (e) => {
  if (e.persisted && state.status === "running") {
    stopClock();
    raf = requestAnimationFrame(frame);
  }
});
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => el(button.dataset.close).close());
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    )
      dialog.close();
  });
el("aboutBtn").addEventListener("click", () => el("infoModal").showModal());
el("compareBtn").addEventListener("click", () => {
  if (state.elapsed < MODEL.burnTime) return;
  el("compareModal").showModal();
  renderComparison(state.run);
});
new ResizeObserver(() => {
  if (el("compareModal").open) renderComparison(state.run);
}).observe(el("comparison"));
el("exportBtn").addEventListener("click", async () => {
  const button = el("exportBtn");
  button.disabled = true;
  try {
    await exportReport(state.run);
  } catch {
    button.textContent = "저장 실패 · 다시 시도";
  } finally {
    button.disabled = false;
  }
});
updateConditions();
