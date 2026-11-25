import { FUELS, MODEL, simulate, escapeThreshold } from "./physics.js";
const fmt = (v, n = 3) =>
  v.toLocaleString("ko-KR", {
    minimumFractionDigits: n,
    maximumFractionDigits: n,
  });
const font =
  '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const mono = "Menlo,Consolas,monospace";
export const comparisonRuns = (fraction) =>
  Object.keys(FUELS).map((id) => simulate(id, fraction));
let curves;
function plotData() {
  if (!curves)
    curves = Object.keys(FUELS).map((id) => ({
      id,
      points: Array.from({ length: 65 }, (_, i) => {
        const fraction = 0.75 + (i * 0.24) / 64;
        const r = simulate(id, fraction);
        return { fraction, ideal: r.ideal, velocity: r.cutoff.v };
      }),
    }));
  return curves;
}
export function drawChart(
  canvas,
  { width, height, fuelId, fraction, exportMode = false },
) {
  const c = canvas.getContext("2d"),
    dpr = exportMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = exportMode
    ? {
        bg: "#f5f6f0",
        text: "#6f7d6a",
        grid: "#dce2d5",
        line: "#8b9987",
        fuels: { rp1: "#a9643d", ch4: "#347d78", lh2: "#536b9b" },
      }
    : {
        bg: "#172230",
        text: "#8da7bd",
        grid: "#2c4053",
        line: "#728ba2",
        fuels: Object.fromEntries(
          Object.entries(FUELS).map(([id, f]) => [id, f.color]),
        ),
      };
  c.fillStyle = colors.bg;
  c.fillRect(0, 0, width, height);
  const left = 43,
    right = width - 20,
    top = 29,
    bottom = height - 37;
  const px = (f) => left + ((f - 0.75) / 0.24) * (right - left),
    py = (v) => bottom - (v / 21000) * (bottom - top);
  c.font = `10px ${mono}`;
  c.textAlign = "left";
  c.fillStyle = colors.text;
  c.fillText("km/s", left, 13);
  for (const v of [0, 5000, 10000, 15000, 20000]) {
    c.strokeStyle = colors.grid;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(left, py(v));
    c.lineTo(right, py(v));
    c.stroke();
    c.fillStyle = colors.text;
    c.textAlign = "right";
    c.fillText(v / 1000, left - 12, py(v) + 3);
  }
  for (const f of [0.75, 0.81, 0.87, 0.93, 0.99]) {
    c.fillStyle = colors.text;
    c.textAlign = "center";
    c.fillText(`${Math.round(f * 100)}%`, px(f), bottom + 20);
  }
  c.strokeStyle = colors.line;
  c.setLineDash([3, 4]);
  c.beginPath();
  c.moveTo(px(fraction), top);
  c.lineTo(px(fraction), bottom);
  c.stroke();
  c.setLineDash([]);
  for (const { id, points } of plotData()) {
    c.strokeStyle = colors.fuels[id];
    for (const key of ["ideal", "velocity"]) {
      c.globalAlpha = key === "ideal" ? 0.38 : 1;
      c.lineWidth = key === "ideal" ? 1 : id === fuelId ? 2.3 : 1.6;
      c.setLineDash(key === "ideal" ? [3, 4] : []);
      c.beginPath();
      points.forEach((p, i) => {
        if (!i) c.moveTo(px(p.fraction), py(p[key]));
        else c.lineTo(px(p.fraction), py(p[key]));
      });
      c.stroke();
    }
    c.globalAlpha = 1;
    c.setLineDash([]);
    const result = simulate(id, fraction);
    c.fillStyle = colors.fuels[id];
    c.beginPath();
    c.arc(
      px(fraction),
      py(result.cutoff.v),
      id === fuelId ? 4 : 3,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.strokeStyle = colors.bg;
    c.lineWidth = 1;
    c.stroke();
  }
}
export function renderComparison(run) {
  document.getElementById("compareConditions").textContent =
    `추진제 비율 ${fmt(run.fraction * 100, 1)}% · 초기 120 t · 연소 180 s`;
  document.getElementById("compareRows").replaceChildren(
    ...comparisonRuns(run.fraction).map((r) => {
      const tr = document.createElement("tr");
      if (r.fuelId === run.fuelId) tr.className = "selected-row";
      const cells = [
        FUELS[r.fuelId].name,
        fmt(r.ideal / 1000),
        fmt(r.cutoff.v / 1000),
        fmt(r.cutoff.h / 1000, 1),
        r.escape ? "가능" : "불가",
        fmt(escapeThreshold(r.fuelId).fraction * 100, 2),
      ];
      cells.forEach((text, i) => {
        const td = document.createElement(i ? "td" : "th");
        if (!i) {
          td.scope = "row";
          td.style.color = FUELS[r.fuelId].color;
        }
        td.textContent = text;
        tr.append(td);
      });
      return tr;
    }),
  );
  const canvas = document.getElementById("comparison");
  drawChart(canvas, {
    width: canvas.getBoundingClientRect().width,
    height: 255,
    fuelId: run.fuelId,
    fraction: run.fraction,
  });
}
export async function exportReport(run) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 1200;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f5f6f0";
  c.fillRect(0, 0, 1440, 1200);
  c.fillStyle = "#26382e";
  c.font = `500 32px ${font}`;
  c.fillText("로켓 추진제 실험 — 결과 비교", 66, 78);
  c.font = `18px ${font}`;
  c.fillStyle = "#67765f";
  c.fillText(
    `추진제 질량 비율 ${fmt(run.fraction * 100, 1)}% · 초기 질량 120 t · 연소 시간 180 s`,
    66,
    124,
  );
  const cols = [66, 410, 680, 902, 1087, 1374],
    labels = [
      "추진제 / 가정 비추력",
      "이상적 Δv (km/s)",
      "속도 (km/s)",
      "고도 (km)",
      "탈출",
      "탈출 경계 (%)",
    ];
  c.font = `16px ${font}`;
  labels.forEach((label, i) => {
    c.textAlign = i ? "right" : "left";
    c.fillText(label, cols[i], 189);
  });
  const colors = { rp1: "#a9643d", ch4: "#347d78", lh2: "#536b9b" };
  comparisonRuns(run.fraction).forEach((r, j) => {
    const y = 239 + j * 56;
    if (r.fuelId === run.fuelId) {
      c.fillStyle = "#e9eee4";
      c.fillRect(53, y - 31, 1334, 49);
    }
    c.strokeStyle = "#d5dece";
    c.beginPath();
    c.moveTo(66, y + 23);
    c.lineTo(1374, y + 23);
    c.stroke();
    const values = [
      `${FUELS[r.fuelId].name} / ${r.isp} s`,
      fmt(r.ideal / 1000),
      fmt(r.cutoff.v / 1000),
      fmt(r.cutoff.h / 1000, 1),
      r.escape ? "가능" : "불가",
      fmt(escapeThreshold(r.fuelId).fraction * 100, 2),
    ];
    values.forEach((v, i) => {
      c.textAlign = i ? "right" : "left";
      c.fillStyle = i ? "#344536" : colors[r.fuelId];
      c.font = `19px ${i === 4 ? font : mono}`;
      c.fillText(v, cols[i], y);
    });
  });
  c.textAlign = "left";
  c.fillStyle = "#596f55";
  c.font = `19px ${font}`;
  c.fillText("추진제 질량 비율에 따른 속도", 66, 444);
  const chart = document.createElement("canvas");
  drawChart(chart, {
    width: 1308,
    height: 390,
    fuelId: run.fuelId,
    fraction: run.fraction,
    exportMode: true,
  });
  c.drawImage(chart, 66, 464);
  c.fillStyle = "#6e7c66";
  c.font = `15px ${font}`;
  c.fillText(
    "실선: 연소 종료 속도 · 점선: 중력 손실을 제외한 이상적 Δv",
    109,
    879,
  );
  Object.entries(FUELS).forEach(([id, f], i) => {
    let x = 450 + i * 200;
    c.fillStyle = colors[id];
    c.fillRect(x, 918, 24, 3);
    c.fillStyle = "#607357";
    c.font = `16px ${mono}`;
    c.fillText(f.name, x + 36, 924);
  });
  c.fillStyle = "#6e7c66";
  c.font = `16px ${font}`;
  c.fillText(
    "속도·고도·탈출은 연소 종료(180 s) 기준. 탈출 조건: 상승 중이며 ε = v²/2 − μ/(R+h) ≥ 0.",
    66,
    983,
  );
  c.fillText(
    "탈출 경계는 초기 총질량 120 t를 고정한 값. 추진제에는 산화제를 포함합니다.",
    66,
    1017,
  );
  c.fillText(
    "비추력은 비교용 엔진 성능 가정값. 진공 · 단일단 · 수직 비행. 대기 저항·자전·다단 분리 제외.",
    66,
    1051,
  );
  c.font = `14px ${font}`;
  c.fillStyle = "#89917e";
  c.fillText(
    "참고: NASA Glenn Research Center · Ideal Rocket Equation / Specific Impulse",
    66,
    1122,
  );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw Error("PNG 생성 실패");
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `propulsion-comparison-${(run.fraction * 100).toFixed(1)}pct.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
