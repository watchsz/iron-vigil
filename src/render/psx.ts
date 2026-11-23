// Rendu PSX : basse résolution, vertex snapping, couleur 15 bits + dithering, ciel d'éclipse.
import * as THREE from 'three';

/** Réglages modifiables en direct (panneau debug). */
export const psx = { enabled: true, height: 240, snap: true, dither: true, colorBits: 5 };

const snapGrid = { value: new THREE.Vector2() }; // résolution de la grille de snapping, 0 = désactivé

/** Matériau des objets du jeu : Lambert + positions écran arrondies (le « tremblement » PS1). */
// ponytail: pas de mapping affine tant qu'il n'y a pas de textures, à ajouter en phase 3.
export function psxMaterial(color: number) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSnap = snapGrid;
    sh.vertexShader = 'uniform vec2 uSnap;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      if (uSnap.x > 0.0) {
        vec2 g = uSnap * 0.5;
        gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + 0.5) / g * gl_Position.w;
      }`);
  };
  return m;
}

/** Dôme de ciel : dégradé rouge/noir et soleil éclipsé avec sa couronne. */
export function createSky(horizon: THREE.Color, sunDir: THREE.Vector3) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uHorizon: { value: horizon }, uSun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uHorizon; uniform vec3 uSun; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, vec3(0.004, 0.0, 0.0), smoothstep(0.0, 0.35, d.y));
        float a = acos(clamp(dot(d, uSun), -1.0, 1.0));
        const float R = 0.035;
        col += vec3(1.0, 0.18, 0.02) * (exp(-(a - R) * 40.0) * 0.9 + exp(-(a - R) * 6.0) * 0.2) * step(R, a);
        if (a < R) col = vec3(0.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), mat);
}

/** Rend la scène en basse résolution puis l'upscale en nearest avec quantification + dithering 4×4. */
export function createPsxRenderer(renderer: THREE.WebGLRenderer) {
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType,
  });
  const post = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, uRes: { value: new THREE.Vector2() }, uLevels: { value: 31 }, uDither: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D tScene; uniform vec2 uRes; uniform float uLevels; uniform float uDither; varying vec2 vUv;
      const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      void main() {
        vec3 c = linearToOutputTexel(texture2D(tScene, vUv)).rgb;
        ivec2 p = ivec2(mod(floor(vUv * uRes), 4.0));
        c += uDither * (BAYER[p.x + p.y * 4] / 16.0 - 0.47) / uLevels;
        gl_FragColor = vec4(floor(c * uLevels + 0.5) / uLevels, 1.0);
      }`,
  });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();

  return function render(scene: THREE.Scene, camera: THREE.Camera) {
    if (!psx.enabled) {
      snapGrid.value.set(0, 0);
      renderer.render(scene, camera);
      return;
    }
    renderer.getSize(size);
    const h = psx.height, w = Math.round((h * size.x) / size.y);
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    snapGrid.value.set(psx.snap ? w : 0, h);
    post.uniforms.uRes!.value.set(w, h);
    post.uniforms.uLevels!.value = 2 ** psx.colorBits - 1;
    post.uniforms.uDither!.value = psx.dither ? 1 : 0;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  };
}
