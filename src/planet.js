import * as THREE from "three";

// An analytic orthographic sphere avoids tessellation gaps at the surface and
// keeps sub-kilometre horizon precision while framing the full Earth later.
export function createPlanet(onLoad) {
  const placeholder = new THREE.DataTexture(
    new Uint8Array([20, 42, 65, 255]),
    1,
    1,
  );
  placeholder.needsUpdate = true;
  const uniforms = {
    size: { value: new THREE.Vector2() },
    centerX: { value: 0 },
    surface: { value: 0 },
    radius: { value: 1 },
    altitude: { value: 0 },
    dayMap: { value: placeholder },
    orientation: {
      value: new THREE.Matrix3().setFromMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(0.26, 2.0, -0.8),
        ),
      ),
    },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}",
    fragmentShader: `precision highp float;
    varying vec2 vUv;uniform vec2 size;uniform float centerX;uniform float surface;uniform float radius;uniform float altitude;uniform sampler2D dayMap;uniform mat3 orientation;
    vec2 sphereUV(vec3 n){return vec2(.5+atan(n.z,n.x)/6.2831853,.5+asin(clamp(n.y,-1.,1.))/3.14159265);}
    void main(){
      vec2 p=vec2(vUv.x*size.x,(1.-vUv.y)*size.y);
      float x=(p.x-centerX)/radius;float d=(p.y-surface)/radius;
      float z2=2.*d-d*d-x*x;
      if(z2<0.){
        float outside=-z2*radius*.5;float width=clamp(radius*.004,1.2,13.);
        float haze=exp(-outside/width)*.27;
        if(haze<.008)discard;
        gl_FragColor=vec4(.17,.38,.66,haze);
      }else{
        vec3 n=normalize(vec3(x,1.-d,sqrt(z2)));
        vec2 uv=sphereUV(normalize(orientation*n));
        vec3 land=texture2D(dayMap,uv).rgb;
        float local=1.-smoothstep(300.,18000.,altitude);
        land=mix(land,vec3(.055,.073,.083),local);
        vec3 sun=normalize(vec3(-.4,.65,1.));float light=max(dot(n,sun),0.);
        vec3 color=land*(.15+light*1.6);
        float ocean=smoothstep(.015,.09,land.b-land.r);
        float spec=pow(max(dot(reflect(-sun,n),vec3(0.,0.,1.)),0.),40.);
        color+=vec3(.25,.35,.44)*spec*ocean*.25;
        float limb=pow(1.-n.z,4.)*(1.-local);
        color=mix(color,vec3(.12,.28,.46),limb*.28);
        gl_FragColor=vec4(color,1.);
      }
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const loader = new THREE.TextureLoader();
  loader.load(
    `${import.meta.env.BASE_URL}assets/earth-blue-marble.jpg`,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      uniforms.dayMap.value = t;
      onLoad();
    },
  );
  return {
    scene,
    update({ width, height, x, surface, radius, altitude }) {
      uniforms.size.value.set(width, height);
      uniforms.centerX.value = x;
      uniforms.surface.value = surface;
      uniforms.radius.value = radius;
      uniforms.altitude.value = altitude;
    },
  };
}
