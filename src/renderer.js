import * as THREE from "three";
import { MODEL } from "./physics.js";
import { createPlanet } from "./planet.js";
import { FlightRenderer as CanvasRenderer } from "./renderer-2d.js";

const clamp = THREE.MathUtils.clamp;

// All procedural detail is created once. No texture generation in the frame loop.
function metalTextures() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const c = canvas.getContext("2d");
  const image = c.createImageData(256, 512);
  let seed = 1209;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < 512; y++) {
    const line = random() * 8;
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4,
        v = 161 + line + random() * 12;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
}
function environment() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#aabcc9");
  g.addColorStop(0.45, "#293747");
  g.addColorStop(0.6, "#121a24");
  g.addColorStop(1, "#526c86");
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 256);
  c.fillStyle = "#dbe3e3";
  c.fillRect(80, 20, 34, 150);
  c.fillStyle = "#7a93a8";
  c.fillRect(310, 30, 62, 150);
  c.fillStyle = "#ebd7b7";
  c.fillRect(470, 40, 20, 105);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  parent.add(item);
  return item;
}
function cylinder(
  parent,
  material,
  radius,
  height,
  y,
  radiusBottom = radius,
  segments = 48,
) {
  return mesh(
    new THREE.CylinderGeometry(radius, radiusBottom, height, segments),
    material,
    parent,
    0,
    y,
  );
}

function rocketModel() {
  const group = new THREE.Group();
  const grain = metalTextures();
  const alloy = new THREE.MeshStandardMaterial({
    color: 0xd6dce0,
    metalness: 0.78,
    roughness: 0.32,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.055,
  });
  const titanium = new THREE.MeshStandardMaterial({
    color: 0x8f9aa3,
    metalness: 0.9,
    roughness: 0.37,
    roughnessMap: grain,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1e262f,
    metalness: 0.45,
    roughness: 0.53,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xd9dddb,
    metalness: 0.26,
    roughness: 0.42,
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x11171c,
    metalness: 0.23,
    roughness: 0.55,
  });
  cylinder(group, alloy, 12, 197, 128.5);
  const points = [
    [12, 0],
    [11.95, 7],
    [11.2, 17],
    [9.7, 29],
    [7.4, 40],
    [4.5, 51],
    [1.5, 60],
    [0, 64],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(points, 64), white, group, 0, 227);
  cylinder(group, black, 12.15, 10, 203);
  cylinder(group, titanium, 12.12, 1, 209);
  cylinder(group, titanium, 12.05, 0.7, 226.5);
  cylinder(group, dark, 11.7, 10, 29);
  cylinder(group, titanium, 9.6, 7, 21);
  cylinder(group, titanium, 4.2, 8, 14);
  for (const y of [47, 103, 167, 186]) {
    cylinder(group, titanium, 12.06, 0.46, y);
    cylinder(group, alloy, 12.1, 0.42, y - 0.8);
  }
  // A narrow external cable raceway, access panel and flush fasteners.
  mesh(new THREE.BoxGeometry(1.4, 138, 1.1), titanium, group, 3, 119, 11.8);
  mesh(new THREE.BoxGeometry(6.5, 13, 0.35), titanium, group, -3, 155, 11.9);
  mesh(new THREE.BoxGeometry(2, 2, 0.4), dark, group, -3, 157, 12.2);
  mesh(new THREE.BoxGeometry(2, 0.7, 0.4), dark, group, -3, 152, 12.2);
  const bolts = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.27, 5, 4),
    titanium,
    48,
  );
  const boltMatrix = new THREE.Matrix4();
  let boltIndex = 0;
  for (const y of [48, 104, 168, 187])
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      boltMatrix.makeTranslation(
        Math.cos(a) * 12.1,
        y + 1.4,
        Math.sin(a) * 12.1,
      );
      bolts.setMatrixAt(boltIndex++, boltMatrix);
    }
  group.add(bolts);
  // Four thin, tapered fins. Extruded airfoil plates show real edge shading.
  const finShape = new THREE.Shape();
  finShape.moveTo(11, 66);
  finShape.lineTo(29, 15);
  finShape.lineTo(28, 6);
  finShape.lineTo(11, 24);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.85,
    bevelEnabled: true,
    bevelSize: 0.35,
    bevelThickness: 0.2,
    bevelSegments: 1,
    steps: 1,
  });
  for (let i = 0; i < 4; i++) {
    const fin = mesh(finGeo, titanium, group);
    fin.rotation.y = (i * Math.PI) / 2;
  }
  const bellPoints = [
    [4.1, 11],
    [3.8, 9],
    [4, 7],
    [4.8, 4],
    [6.5, 1],
    [8.6, -2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bellMaterial = new THREE.MeshStandardMaterial({
    color: 0x727c80,
    metalness: 0.86,
    roughness: 0.43,
    side: THREE.DoubleSide,
  });
  mesh(new THREE.LatheGeometry(bellPoints, 48), bellMaterial, group);
  const throatMaterial = new THREE.MeshBasicMaterial({ color: 0x1b2429 });
  const throat = mesh(
    new THREE.CircleGeometry(7.8, 40),
    throatMaterial,
    group,
    0,
    -1.6,
  );
  throat.rotation.x = -Math.PI / 2;
  group.rotation.y = 0.48;
  group.rotation.x = 0.025;
  return { group, throatMaterial };
}

const plumeVertex = `varying vec2 vUv; varying float vY; void main(){vUv=uv;vY=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const plumeFragment = `precision highp float; varying vec2 vUv; varying float vY; uniform float time;uniform float clipY;uniform vec3 tint;
void main(){if(vY<clipY)discard;float axial=vUv.y;float rim=pow(max(0.,sin(vUv.x*3.14159265)),.7);float cells=.78+.22*sin(axial*65.-time*5.);float flicker=.94+.06*sin(time*39.+axial*17.);float a=pow(axial,1.35)*rim*cells*flicker*.8;vec3 color=mix(tint,vec3(1.,.97,.87),pow(axial,5.));gl_FragColor=vec4(color,a);}`;

export class FlightRenderer {
  constructor(canvas) {
    try {
      this.init(canvas);
    } catch (error) {
      this.gl?.dispose();
      const replacement = canvas.cloneNode();
      canvas.replaceWith(replacement);
      const fallback = new CanvasRenderer(replacement);
      fallback.mode = "2d";
      console.info("WebGL unavailable; using 2D renderer.", error.message);
      return fallback;
    }
  }
  init(canvas) {
    this.canvas = canvas;
    this.mode = "3d";
    this.last = null;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.gl.setClearColor(0x080d15);
    this.gl.autoClear = false;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.environment = environment();
    this.scene.add(new THREE.HemisphereLight(0xc9d9e8, 0x182638, 2.1));
    const key = new THREE.DirectionalLight(0xffedd4, 3.7);
    key.position.set(-3, 4, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7ca9cf, 2.4);
    rim.position.set(3, 1, -3);
    this.scene.add(rim);
    const model = rocketModel();
    this.rocket = model.group;
    this.throat = model.throatMaterial;
    this.scene.add(this.rocket);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    this.camera.position.z = 700;
    const flamePoints = [
      [0, -153],
      [5, -128],
      [12, -75],
      [12, -30],
      [7.7, -2],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    this.flameMaterial = new THREE.ShaderMaterial({
      vertexShader: plumeVertex,
      fragmentShader: plumeFragment,
      uniforms: {
        time: { value: 0 },
        clipY: { value: -200 },
        tint: { value: new THREE.Color() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.flame = mesh(
      new THREE.LatheGeometry(flamePoints, 32),
      this.flameMaterial,
      this.scene,
    );
    this.backgroundScene = new THREE.Scene();
    this.backgroundCamera = new THREE.Camera();
    this.skyMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: { darkness: { value: 0 } },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}",
      fragmentShader: `varying vec2 vUv;uniform float darkness;void main(){vec3 low=mix(vec3(.12,.19,.26),vec3(.018,.032,.054),darkness);vec3 high=mix(vec3(.025,.052,.086),vec3(.007,.012,.023),darkness);gl_FragColor=vec4(mix(low,high,pow(vUv.y,.65)),1.);}`,
    });
    mesh(new THREE.PlaneGeometry(2, 2), this.skyMaterial, this.backgroundScene);
    this.planet = createPlanet(() => {
      if (this.last) this.draw(this.last);
    });
    // Stars are a sparse, static reference field, not an animated skybox.
    const positions = [];
    for (let i = 1; i <= 115; i++) {
      positions.push(
        ((i * 0.618034) % 1) * 2 - 1,
        ((i * 0.414214) % 1) * 2 - 1,
        0,
      );
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: 0xaab8c8,
        size: 1.15,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.starScene = new THREE.Scene();
    this.starScene.add(this.stars);
    this.pad = mesh(
      new THREE.CylinderGeometry(34, 39, 5, 48),
      new THREE.MeshStandardMaterial({
        color: 0x293540,
        metalness: 0.45,
        roughness: 0.7,
      }),
      this.scene,
    );
    this.pad.position.y = -5;
    this.observer = new ResizeObserver(() => {
      this.resize();
      if (this.last) this.draw(this.last);
    });
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      document.getElementById("sceneCaption").textContent =
        "3D 표시 일시 중단 · 복구 중";
    });
    canvas.addEventListener("webglcontextrestored", () => {
      document.getElementById("sceneCaption").textContent =
        "로켓 확대 · 자동 시야";
      if (this.last) this.draw(this.last);
    });
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.mobile = window.matchMedia("(max-width:760px)").matches;
    this.gl.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 1.75),
    );
    this.gl.setSize(this.w, this.h, false);
    this.camera.left = -this.w / 2;
    this.camera.right = this.w / 2;
    this.camera.top = this.h / 2;
    this.camera.bottom = -this.h / 2;
    this.camera.updateProjectionMatrix();
  }
  draw(state) {
    this.last = state;
    if (!this.w || !this.h) return;
    const { point, fuelId } = state,
      alt = point.h,
      w = this.w,
      h = this.h;
    const area = h - (this.mobile ? 84 : 100),
      scale =
        clamp(area / 620, 0.45, 1.18) * (1 - (0.13 * alt) / (alt + 20000));
    const anchor = Math.max(
      area * (0.86 - (0.2 * alt) / (alt + 650)),
      291 * scale + (this.mobile ? 105 : 152),
    );
    const x = w * (this.mobile ? 0.46 : 0.48),
      mpp = Math.max(0.4, (alt + 200) / (area * 0.19));
    const radius = MODEL.radius / mpp;
    this.planet.update({
      width: w,
      height: h,
      x,
      surface: anchor + alt / mpp,
      radius,
      altitude: alt,
    });
    this.rocket.position.set(x - w / 2, h / 2 - anchor, 0);
    this.rocket.scale.setScalar(scale);
    this.pad.position.set(x - w / 2, h / 2 - anchor - alt / mpp - 4, 0);
    this.pad.visible = alt < 900;
    this.pad.scale.setScalar(Math.min(scale, Math.max(0.2, 36 / mpp / 68)));
    const burning = point.phase === "burn";
    this.flame.visible = burning;
    if (burning) {
      this.flame.position.copy(this.rocket.position);
      this.flame.scale.set(
        scale * (1 + 0.45 * (1 - Math.exp(-alt / 30000))),
        scale * Math.min(1, point.t / 1.2),
        scale,
      );
      this.flameMaterial.uniforms.time.value = point.t;
      this.flameMaterial.uniforms.clipY.value =
        -alt / mpp / Math.max(0.001, this.flame.scale.y);
      this.flameMaterial.uniforms.tint.value.set(
        fuelId === "rp1" ? 0xe5a65f : fuelId === "ch4" ? 0x87bce9 : 0x8bb5e3,
      );
    }
    this.throat.color.set(burning ? 0xffdab0 : 0x1b2429);
    const dark = 1 - Math.exp(-alt / 65000);
    this.skyMaterial.uniforms.darkness.value = dark;
    this.stars.material.opacity = 0.4 * clamp((alt - 55000) / 180000, 0, 1);
    this.gl.clear();
    this.gl.render(this.backgroundScene, this.backgroundCamera);
    this.gl.render(this.starScene, this.backgroundCamera);
    this.gl.clearDepth();
    this.gl.render(this.planet.scene, this.backgroundCamera);
    this.gl.clearDepth();
    this.gl.render(this.scene, this.camera);
  }
}
