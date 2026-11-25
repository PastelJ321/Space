import { MODEL } from "./physics.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (v) => `rgb(${v.join(",")})`;

export class FlightRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.last = null;
    this.observer = new ResizeObserver(() => {
      this.resize();
      if (this.last) this.draw(this.last);
    });
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  draw(state) {
    this.last = state;
    const { w, h, ctx: c } = this;
    if (!w || !h) return;
    const { point, phase } = state;
    const altitude = point.h;
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const area = h - (mobile ? 78 : 89);
    const scale = clamp(area / 625, 0.46, 1.18);
    const x = w * (w < 500 ? 0.48 : 0.5);
    // This view transform is shared by the planet, launch pad and altitude ruler.
    // The enlarged rocket is anchored at its nozzle, at the calculated altitude.
    const anchor = Math.max(
      area * (0.86 - (0.2 * altitude) / (altitude + 500)),
      278 * scale + (mobile ? 100 : 145),
    );
    const metersPerPixel = Math.max(0.35, (altitude + 200) / (area * 0.27));
    const surface = anchor + altitude / metersPerPixel;
    const radius = MODEL.radius / metersPerPixel;
    const darkness = 1 - Math.exp(-altitude / 65000);
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgb(mix([26, 43, 56], [11, 19, 28], darkness)));
    sky.addColorStop(0.6, rgb(mix([55, 78, 93], [19, 32, 45], darkness)));
    sky.addColorStop(1, rgb(mix([112, 133, 141], [41, 61, 76], darkness)));
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    if (altitude > 70000) {
      c.fillStyle = "#d8e0de";
      c.globalAlpha = 0.23 * clamp((altitude - 70000) / 400000, 0, 1);
      // Sparse fixed stars. No twinkling, drift or idle animation.
      for (let i = 1; i <= 19; i++) {
        const sx = ((i * 0.61803398875) % 1) * w;
        const sy = ((i * 0.41421356237) % 1) * area * 0.8;
        c.fillRect(sx, sy, i % 5 === 0 ? 1.3 : 0.8, i % 5 === 0 ? 1.3 : 0.8);
      }
      c.globalAlpha = 1;
    }
    // A spherical Earth in the same linear view coordinates as the ruler.
    c.save();
    c.beginPath();
    c.arc(x, surface + radius, radius, 0, Math.PI * 2);
    const ground = c.createLinearGradient(0, surface, 0, h);
    ground.addColorStop(0, rgb(mix([75, 91, 91], [48, 77, 91], darkness)));
    ground.addColorStop(0.12, rgb(mix([52, 67, 69], [30, 51, 66], darkness)));
    ground.addColorStop(1, "#203139");
    c.fillStyle = ground;
    c.fill();
    c.strokeStyle = `rgba(178,201,204,${0.2 + 0.24 * darkness})`;
    c.lineWidth = 1;
    c.stroke();
    c.restore();
    if (altitude < 700)
      this.pad(x, surface, metersPerPixel, 1 - altitude / 700);
    this.ruler({ anchor, altitude, metersPerPixel, area });
    const powered = phase === "burn";
    if (powered) this.plume(x, anchor, scale, point.t, altitude, state.fuelId);
    this.rocket(x, anchor, scale, powered);
  }
  pad(x, surface, mpp, opacity) {
    const c = this.ctx,
      width = clamp(36 / mpp, 35, 140);
    c.save();
    c.globalAlpha = opacity;
    c.fillStyle = "#27383d";
    c.fillRect(x - width / 2, surface + 1, width, 6);
    c.fillStyle = "#7d8987";
    c.fillRect(x - width / 2, surface - 2, width, 3);
    c.fillStyle = "#304045";
    c.beginPath();
    c.moveTo(x - width / 2, surface + 7);
    c.lineTo(x - width * 0.8, surface + 15);
    c.lineTo(x + width * 0.8, surface + 15);
    c.lineTo(x + width / 2, surface + 7);
    c.fill();
    c.restore();
  }
  ruler({ anchor, altitude, metersPerPixel, area }) {
    const c = this.ctx,
      x = this.w - (this.w < 500 ? 29 : 51);
    const top = this.w < 500 ? 128 : 168,
      bottom = area - 30;
    const interval = metersPerPixel * (this.w < 500 ? 65 : 85);
    const power = 10 ** Math.floor(Math.log10(interval));
    const step = [1, 2, 5, 10].find((v) => v * power >= interval) * power;
    const low = Math.max(0, altitude - (bottom - anchor) * metersPerPixel);
    const high = altitude + (anchor - top) * metersPerPixel;
    const km = step >= 1000;
    c.save();
    c.font = "10px Menlo, Consolas, monospace";
    c.textAlign = "right";
    c.fillStyle = "#bdcace";
    c.fillText(km ? "km" : "m", x + 4, top - 19);
    for (
      let value = Math.ceil(low / step) * step;
      value <= high;
      value += step
    ) {
      const y = anchor - (value - altitude) / metersPerPixel;
      c.strokeStyle = "#adbec55c";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - 7, y);
      c.lineTo(x + 4, y);
      c.stroke();
      c.fillStyle = "#aabdc4";
      c.fillText(
        (km ? value / 1000 : value).toLocaleString("ko-KR", {
          maximumFractionDigits: 1,
        }),
        x - 15,
        y + 3,
      );
    }
    // This marker is at the rocket's calculated reference position, not a HUD decoration.
    c.fillStyle = "#d8e3e0";
    c.beginPath();
    c.moveTo(x + 4, anchor);
    c.lineTo(x + 10, anchor - 3);
    c.lineTo(x + 10, anchor + 3);
    c.closePath();
    c.fill();
    c.restore();
  }
  plume(x, y, s, time, altitude, fuel) {
    const c = this.ctx;
    const ignition = clamp(time / 1.2, 0, 1);
    const expansion = 1 - Math.exp(-altitude / 24000);
    const flutter =
      1 + 0.035 * Math.sin(time * 47) + 0.018 * Math.sin(time * 89);
    const length = (95 + 46 * expansion) * ignition * flutter;
    const spread = 11 + expansion * 13;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    const tint =
      fuel === "rp1"
        ? [229, 170, 105]
        : fuel === "ch4"
          ? [157, 192, 221]
          : [161, 188, 212];
    const plume = c.createLinearGradient(0, -1, 0, length);
    plume.addColorStop(0, "#f2f3df");
    plume.addColorStop(0.12, `rgba(${tint},.8)`);
    plume.addColorStop(0.42, `rgba(${tint},.35)`);
    plume.addColorStop(1, `rgba(${tint},0)`);
    c.fillStyle = plume;
    c.beginPath();
    c.moveTo(-8, -1);
    c.bezierCurveTo(
      -spread,
      length * 0.3,
      -spread * 0.65,
      length * 0.7,
      0,
      length,
    );
    c.bezierCurveTo(spread * 0.65, length * 0.7, spread, length * 0.3, 8, -1);
    c.closePath();
    c.fill();
    const core = c.createLinearGradient(0, 0, 0, length * 0.57);
    core.addColorStop(0, "#ffffef");
    core.addColorStop(0.3, "#e6eddfc4");
    core.addColorStop(1, "#c9d7d800");
    c.fillStyle = core;
    c.beginPath();
    c.moveTo(-4, 0);
    c.quadraticCurveTo(-7, length * 0.2, 0, length * 0.57);
    c.quadraticCurveTo(7, length * 0.2, 4, 0);
    c.fill();
    // Restrained pressure cells, tied to elapsed simulation time.
    for (let i = 0; i < 4; i++) {
      const yy = 12 + i * 15,
        ww = 4.3 - i * 0.55;
      c.fillStyle = `rgba(235,236,218,${0.2 - i * 0.035})`;
      c.beginPath();
      c.moveTo(0, yy - 5);
      c.lineTo(ww, yy);
      c.lineTo(0, yy + 6);
      c.lineTo(-ww, yy);
      c.closePath();
      c.fill();
    }
    c.restore();
  }
  rocket(x, nozzleY, scale, powered) {
    const c = this.ctx;
    c.save();
    c.translate(x, nozzleY);
    c.scale(scale, scale);
    // Slender instrumented sounding-rocket form. No cockpit or ornamental markings.
    const fin = c.createLinearGradient(-31, 0, 31, 0);
    fin.addColorStop(0, "#536772");
    fin.addColorStop(0.5, "#9aa9ac");
    fin.addColorStop(1, "#34454f");
    c.fillStyle = fin;
    c.strokeStyle = "#9facac80";
    c.lineWidth = 0.65;
    for (const direction of [-1, 1]) {
      c.beginPath();
      c.moveTo(direction * 12, -66);
      c.lineTo(direction * 29, -17);
      c.lineTo(direction * 28, -8);
      c.lineTo(direction * 11, -20);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = "#bec8c665";
      c.beginPath();
      c.moveTo(direction * 13, -53);
      c.lineTo(direction * 25, -19);
      c.stroke();
    }
    const body = c.createLinearGradient(-14, 0, 14, 0);
    body.addColorStop(0, "#586a73");
    body.addColorStop(0.09, "#88989d");
    body.addColorStop(0.27, "#c0cccb");
    body.addColorStop(0.39, "#e1e6dd");
    body.addColorStop(0.52, "#d1d9d3");
    body.addColorStop(0.74, "#94a7ac");
    body.addColorStop(0.91, "#5c717d");
    body.addColorStop(1, "#3c505e");
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-13, -220);
    c.lineTo(-13, -35);
    c.quadraticCurveTo(-12, -23, -9, -18);
    c.lineTo(9, -18);
    c.quadraticCurveTo(12, -23, 13, -35);
    c.lineTo(13, -220);
    c.closePath();
    c.fill();
    const nose = c.createLinearGradient(-13, -245, 14, -245);
    nose.addColorStop(0, "#71848b");
    nose.addColorStop(0.32, "#dde3db");
    nose.addColorStop(0.49, "#e7ebe1");
    nose.addColorStop(0.75, "#a0b0b1");
    nose.addColorStop(1, "#536977");
    c.fillStyle = nose;
    c.beginPath();
    c.moveTo(-13, -220);
    c.bezierCurveTo(-13, -240, -7, -262, 0, -278);
    c.bezierCurveTo(7, -262, 13, -240, 13, -220);
    c.closePath();
    c.fill();
    c.strokeStyle = "#e9eee54d";
    c.lineWidth = 0.65;
    c.beginPath();
    c.moveTo(-9, -215);
    c.lineTo(-9, -40);
    c.stroke();
    // Flush joints and circumferential bands follow cylindrical lighting.
    for (const yy of [-221, -184, -92, -36]) {
      c.strokeStyle = "#34495588";
      c.lineWidth = 0.7;
      c.beginPath();
      c.ellipse(0, yy, 12.8, 1.2, 0, 0, Math.PI);
      c.stroke();
      c.strokeStyle = "#eef0e076";
      c.beginPath();
      c.moveTo(-12, yy + 1.1);
      c.lineTo(11, yy + 1.1);
      c.stroke();
    }
    c.fillStyle = "#2c3b40";
    c.fillRect(-13, -181, 26, 11);
    c.fillStyle = "#93a4a4";
    c.fillRect(-12, -180, 2, 9);
    c.fillStyle = "#172d39";
    c.fillRect(9, -180, 3, 9);
    // Small instrument panel and engraved datum marks.
    c.fillStyle = "#8e9f9e";
    c.fillRect(-5, -153, 9, 15);
    c.strokeStyle = "#516b724d";
    c.lineWidth = 0.6;
    c.strokeRect(-5, -153, 9, 15);
    c.fillStyle = "#415a61";
    c.fillRect(-2, -149, 3, 2);
    c.fillRect(-2, -143, 3, 1);
    c.fillStyle = "#60777b";
    c.fillRect(-3, -124, 6, 0.8);
    c.fillRect(-3, -120, 6, 0.8);
    for (const yy of [-208, -198, -110, -101]) {
      c.fillStyle = "#526a7066";
      c.fillRect(7, yy, 1, 1);
      c.fillRect(-8, yy, 1, 1);
    }
    // Engine skirt, manifold and bell. No emission after cutoff.
    const skirt = c.createLinearGradient(-10, 0, 10, 0);
    skirt.addColorStop(0, "#273d47");
    skirt.addColorStop(0.36, "#7f9297");
    skirt.addColorStop(1, "#1d323f");
    c.fillStyle = skirt;
    c.fillRect(-9, -23, 18, 8);
    c.strokeStyle = "#1c313c";
    c.lineWidth = 1.2;
    for (let i = -6; i <= 6; i += 3) {
      c.beginPath();
      c.moveTo(i, -22);
      c.lineTo(i, -16);
      c.stroke();
    }
    c.fillStyle = "#4a6069";
    c.fillRect(-4, -16, 8, 5);
    const bell = c.createLinearGradient(-9, 0, 9, 0);
    bell.addColorStop(0, "#2c3c44");
    bell.addColorStop(0.3, "#9a9f97");
    bell.addColorStop(0.6, "#687c80");
    bell.addColorStop(1, "#263d49");
    c.fillStyle = bell;
    c.beginPath();
    c.moveTo(-4, -12);
    c.quadraticCurveTo(-4, -6, -9, -1);
    c.quadraticCurveTo(0, 2, 9, -1);
    c.quadraticCurveTo(4, -6, 4, -12);
    c.closePath();
    c.fill();
    c.fillStyle = powered ? "#f1d4a3" : "#182b34";
    c.beginPath();
    c.ellipse(0, -0.8, 7.6, 1.4, 0, 0, Math.PI * 2);
    c.fill();
    // The central fin casts a narrow shadow on the cylindrical body.
    c.fillStyle = "#324b5866";
    c.beginPath();
    c.moveTo(2, -67);
    c.lineTo(5, -20);
    c.lineTo(1, -15);
    c.closePath();
    c.fill();
    c.fillStyle = "#899b9f";
    c.beginPath();
    c.moveTo(0, -69);
    c.lineTo(1.7, -20);
    c.lineTo(0, -8);
    c.lineTo(-1.4, -20);
    c.closePath();
    c.fill();
    c.restore();
  }
  destroy() {
    this.observer.disconnect();
  }
}
