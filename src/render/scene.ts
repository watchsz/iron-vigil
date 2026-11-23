// Rendu greybox : lit le GameState, ne le modifie jamais.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { createPsxRenderer, createSky, psx, psxMaterial } from './psx';
import { TOWERS, type EnemyKind, type TowerKind } from '../data/content';
import type { GameState } from '../sim/game';

const TOWER_LOOK: Record<TowerKind, { color: number; size: [number, number, number] }> = {
  crossbow: { color: 0x7a5a3a, size: [0.5, 1.2, 0.5] },
  bombard: { color: 0x44444c, size: [0.8, 0.7, 0.8] },
  brazier: { color: 0x8a3010, size: [0.6, 0.6, 0.6] },
  chapel: { color: 0x8a8070, size: [0.7, 1.0, 0.7] },
};
const ENEMY_LOOK: Record<EnemyKind, { color: number; size: [number, number, number] }> = {
  ghoul: { color: 0x6b7a4a, size: [0.4, 0.6, 0.4] },
  hound: { color: 0x9a2a1a, size: [0.5, 0.3, 0.3] },
  knight: { color: 0x404850, size: [0.45, 0.8, 0.45] },
  apostle: { color: 0x3a1020, size: [1.2, 2.2, 1.2] },
};
const SHOT_COLOR: Record<TowerKind, number> = { crossbow: 0xffd080, bombard: 0xa0a0a0, brazier: 0xff6010, chapel: 0xfff0c0 };
const SHOT_FRAMES = 6;

const box = (color: number, [w, h, d]: [number, number, number]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), psxMaterial({ color }));
  m.geometry.translate(0, h / 2, 0); // origine au sol
  return m;
};

export interface Model { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
const ANIM_FPS = 12; // animations lues en pas saccadés, look PSX

/** Charge les .glb de public/assets (produits par `docker compose run --rm assets`) avec les matériaux PSX. */
export async function loadModels(names: string[]) {
  const loader = new GLTFLoader();
  const models = new Map<string, Model>();
  await Promise.all(names.map(async (n) => {
    const gltf = await loader.loadAsync(`assets/${n}.glb`);
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.MeshStandardMaterial;
      o.material = psxMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity });
    });
    models.set(n, { scene: gltf.scene, clips: gltf.animations });
  }));
  return models;
}

export function createView(parent: HTMLElement, s: GameState, models: Map<string, Model>) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  parent.appendChild(renderer.domElement);

  const render = createPsxRenderer(renderer);

  const horizon = new THREE.Color(0x4a0c06);
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(horizon, 12, 40);
  scene.fog = fog;
  scene.add(createSky(horizon, new THREE.Vector3(0.25, 0.04, -1)));
  const lights = {
    hemi: new THREE.HemisphereLight(0xb08878, 0x1a0c08, 4),
    key: new THREE.DirectionalLight(0xffc0a0, 1.8),  // lumière principale, côté caméra
    rim: new THREE.DirectionalLight(0xff4010, 3),    // contre-jour de l'éclipse
  };
  lights.key.position.set(-4, 8, 8);
  lights.rim.position.set(6, 3, -20);
  scene.add(lights.hemi, lights.key, lights.rim);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 6, 13);
  // Orbite autour du centre de la carte : glisser = tourner, molette = zoom.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.mouseButtons.RIGHT = null; // clic droit = vendre
  controls.minDistance = 6;
  controls.maxDistance = 28;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.45; // jamais sous le sol
  controls.update();

  const wx = (x: number) => x - s.w / 2 + 0.5;
  const wz = (y: number) => y - s.h / 2 + 0.5;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h)); // invisible : sert au picking
  ground.rotation.x = -Math.PI / 2;
  ground.visible = false;
  scene.add(ground);
  const decor = (name: string) => models.get(name)!.scene.clone();
  scene.add(decor('decor_ground'));
  const wastes = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 40, 40), psxMaterial({ color: 0x1c1612 })); // terres désolées autour
  wastes.rotation.x = -Math.PI / 2;
  wastes.position.y = -0.12;
  scene.add(wastes);

  const grid: number[] = [];
  for (let x = 0; x <= s.w; x++) grid.push(x - s.w / 2, 0.03, -s.h / 2, x - s.w / 2, 0.03, s.h / 2);
  for (let y = 0; y <= s.h; y++) grid.push(-s.w / 2, 0.03, y - s.h / 2, s.w / 2, 0.03, y - s.h / 2);
  const gridGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x806050, transparent: true, opacity: 0.18 })));

  const at = <T extends THREE.Object3D>(m: T, i: number) => { m.position.set(wx(i % s.w), 0, wz((i / s.w) | 0)); return m; };
  s.rocks.forEach((r, i) => {
    if (!r) return;
    const m = at(decor('decor_rock'), i);
    m.rotation.y = (i * 2.399) % (Math.PI * 2); // variété sans hasard : angle d'or
    scene.add(m);
  });
  scene.add(at(decor('decor_gate'), s.goal)); // porte de la forteresse
  scene.add(at(decor('decor_spawn'), s.spawn));

  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 }));
  hover.rotation.x = -Math.PI / 2;
  hover.position.y = 0.02;
  hover.visible = false;
  scene.add(hover);
  const range = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.5 }));
  range.rotation.x = -Math.PI / 2;
  range.position.y = 0.04;
  range.visible = false;
  scene.add(range);

  const towers = new Map<number, THREE.Object3D>();
  const enemies = new Map<number, { obj: THREE.Object3D; mixer?: THREE.AnimationMixer }>();
  const shots: { line: THREE.Line; ttl: number }[] = [];
  const shotMat = Object.fromEntries(Object.entries(SHOT_COLOR).map(([k, c]) => [k, new THREE.LineBasicMaterial({ color: c })])) as Record<TowerKind, THREE.LineBasicMaterial>;
  const circle = (r: number, y: number) => Array.from({ length: 33 }, (_, k) => new THREE.Vector3(Math.cos(k / 16 * Math.PI) * r, y, Math.sin(k / 16 * Math.PI) * r));
  let lastTick = -1;

  function sync(alpha: number) {
    const now = performance.now();
    for (const [i, t] of s.towers) {
      let m = towers.get(i);
      if (!m) {
        const model = models.get(`tower_${t.kind}`);
        m = at(model ? model.scene.clone() : box(TOWER_LOOK[t.kind].color, TOWER_LOOK[t.kind].size), i);
        towers.set(i, m);
        scene.add(m);
      }
      m.scale.setScalar(1 + 0.12 * t.level); // ponytail: niveau = taille, en attendant des modèles par niveau
    }
    for (const [i, m] of towers) if (!s.towers.has(i)) { scene.remove(m); towers.delete(i); }

    const alive = new Set<number>();
    for (const e of s.enemies) {
      alive.add(e.id);
      let v = enemies.get(e.id);
      if (!v) {
        const model = models.get(`enemy_${e.kind}`);
        if (model) {
          const obj = cloneSkinned(model.scene);
          const mixer = new THREE.AnimationMixer(obj);
          const walk = THREE.AnimationClip.findByName(model.clips, 'walk');
          if (walk) mixer.clipAction(walk).play();
          v = { obj, mixer };
        } else {
          v = { obj: box(ENEMY_LOOK[e.kind].color, ENEMY_LOOK[e.kind].size) };
        }
        enemies.set(e.id, v);
        scene.add(v.obj);
      }
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
      v.obj.position.set(wx(x), 0, wz(y));
      if (e.x !== e.px || e.y !== e.py) v.obj.rotation.y = Math.atan2(e.x - e.px, e.y - e.py); // face au sens de marche
      if (v.mixer) v.mixer.setTime(Math.floor((now / 1000 + e.id * 0.37) * ANIM_FPS) / ANIM_FPS); // décalé par ennemi
      else v.obj.scale.y = 0.3 + 0.7 * (e.hp / e.maxHp); // greybox : la taille montre les PV
    }
    for (const [id, v] of enemies) if (!alive.has(id)) { scene.remove(v.obj); enemies.delete(id); }

    if (s.tick !== lastTick) {
      lastTick = s.tick;
      for (const sh of s.shots) {
        const t = s.towers.get(sh.fromY * s.w + sh.fromX);
        const aura = sh.fromX === sh.toX && sh.fromY === sh.toY;
        const pts = aura && t
          ? circle(TOWERS[t.kind].levels[t.level]!.range, 0.1).map((p) => p.add(new THREE.Vector3(wx(sh.fromX), 0, wz(sh.fromY))))
          : [new THREE.Vector3(wx(sh.fromX), 1, wz(sh.fromY)), new THREE.Vector3(wx(sh.toX), 0.3, wz(sh.toY))];
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), shotMat[sh.kind]);
        scene.add(line);
        shots.push({ line, ttl: SHOT_FRAMES });
      }
    }
    for (let k = shots.length - 1; k >= 0; k--) {
      const sh = shots[k]!;
      if (--sh.ttl > 0) continue;
      scene.remove(sh.line); sh.line.geometry.dispose(); shots.splice(k, 1);
    }
    render(scene, camera);
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const ray = new THREE.Raycaster();
  /** Case sous le pointeur (coordonnées client), ou null. */
  function pickCell(cx: number, cy: number): [number, number] | null {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(ground)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x + s.w / 2), y = Math.floor(hit.point.z + s.h / 2);
    return x >= 0 && y >= 0 && x < s.w && y < s.h ? [x, y] : null;
  }

  /** Centre d'une case en coordonnées client (pour les tests e2e). */
  function cellToScreen(x: number, y: number) {
    const v = new THREE.Vector3(wx(x), 0, wz(y)).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  function showRange(x: number, y: number, r: number | null) {
    range.visible = r != null;
    if (r == null) return;
    range.position.x = wx(x); range.position.z = wz(y);
    range.scale.set(r, r, 1);
  }

  function setHover(c: [number, number] | null, ok: boolean) {
    hover.visible = !!c;
    if (!c) return;
    hover.position.x = wx(c[0]); hover.position.z = wz(c[1]);
    (hover.material as THREE.MeshBasicMaterial).color.set(ok ? 0x40ff60 : 0xff3030);
  }

  // Panneau de réglage du rendu (touche P)
  const gui = new GUI({ title: 'Rendu PSX (P)' });
  gui.add(psx, 'enabled').name('PSX');
  gui.add(psx, 'height', 120, 480, 1).name('résolution (lignes)');
  gui.add(psx, 'snap').name('vertex snapping');
  gui.add(psx, 'affine').name('mapping affine');
  gui.add(psx, 'dither').name('dithering');
  gui.add(psx, 'colorBits', 3, 8, 1).name('bits / canal');
  gui.add(fog, 'near', 0, 40).name('brouillard début');
  gui.add(fog, 'far', 5, 120).name('brouillard fin');
  gui.addColor({ c: '#' + horizon.getHexString() }, 'c').name('horizon').onChange((v: string) => { horizon.set(v); fog.color.copy(horizon); });
  gui.add(lights.hemi, 'intensity', 0, 10).name('lumière ambiante');
  gui.add(lights.key, 'intensity', 0, 10).name('lumière principale');
  gui.add(lights.rim, 'intensity', 0, 10).name('contre-jour éclipse');
  gui.hide();
  addEventListener('keydown', (ev) => { if (ev.key === 'p') gui.show(gui._hidden); });

  return { renderer, sync, pickCell, cellToScreen, setHover, showRange };
}
