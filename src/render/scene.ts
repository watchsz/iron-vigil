// Rendu greybox : lit le GameState, ne le modifie jamais.
import * as THREE from 'three';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { createPsxRenderer, createSky, psx, psxMaterial } from './psx';
import type { EnemyKind, TowerKind } from '../data/content';
import type { GameState } from '../sim/game';

const TOWER_LOOK: Record<TowerKind, { color: number; size: [number, number, number] }> = {
  crossbow: { color: 0x7a5a3a, size: [0.5, 1.2, 0.5] },
  bombard: { color: 0x44444c, size: [0.8, 0.7, 0.8] },
};
const ENEMY_LOOK: Record<EnemyKind, { color: number; size: [number, number, number] }> = {
  ghoul: { color: 0x6b7a4a, size: [0.4, 0.6, 0.4] },
  hound: { color: 0x9a2a1a, size: [0.5, 0.3, 0.3] },
};
const SHOT_FRAMES = 6;

const box = (color: number, [w, h, d]: [number, number, number]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), psxMaterial(color));
  m.geometry.translate(0, h / 2, 0); // origine au sol
  return m;
};

export function createView(parent: HTMLElement, s: GameState) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  parent.appendChild(renderer.domElement);

  const render = createPsxRenderer(renderer);

  const horizon = new THREE.Color(0x4a0c06);
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(horizon, 12, 40);
  scene.fog = fog;
  scene.add(createSky(horizon, new THREE.Vector3(0.25, 0.04, -1)));
  scene.add(new THREE.HemisphereLight(0x8a6a5a, 0x100808, 2));
  const sun = new THREE.DirectionalLight(0xffb090, 1.2);
  sun.position.set(-5, 10, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  const cam = { height: 8, back: 12, lookZ: -4 };
  const placeCamera = () => { camera.position.set(0, cam.height, cam.back); camera.lookAt(0, 0, cam.lookZ); };
  placeCamera();

  const wx = (x: number) => x - s.w / 2 + 0.5;
  const wz = (y: number) => y - s.h / 2 + 0.5;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), psxMaterial(0x2b2620));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const wastes = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 40, 40), psxMaterial(0x1c1612)); // terres désolées autour
  wastes.rotation.x = -Math.PI / 2;
  wastes.position.y = -0.02;
  scene.add(wastes);

  const grid: number[] = [];
  for (let x = 0; x <= s.w; x++) grid.push(x - s.w / 2, 0.01, -s.h / 2, x - s.w / 2, 0.01, s.h / 2);
  for (let y = 0; y <= s.h; y++) grid.push(-s.w / 2, 0.01, y - s.h / 2, s.w / 2, 0.01, y - s.h / 2);
  const gridGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x2e2822 })));

  const at = <T extends THREE.Object3D>(m: T, i: number) => { m.position.set(wx(i % s.w), 0, wz((i / s.w) | 0)); return m; };
  s.rocks.forEach((r, i) => { if (r) scene.add(at(box(0x3a3632, [1, 0.8, 1]), i)); });
  scene.add(at(box(0x55504a, [1, 2, 1]), s.goal)); // porte de la forteresse
  scene.add(at(box(0x401010, [1, 0.05, 1]), s.spawn));

  const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 }));
  hover.rotation.x = -Math.PI / 2;
  hover.position.y = 0.02;
  hover.visible = false;
  scene.add(hover);

  const towers = new Map<number, THREE.Mesh>();
  const enemies = new Map<number, THREE.Mesh>();
  const shots: { line: THREE.Line; ttl: number }[] = [];
  const shotMat = new THREE.LineBasicMaterial({ color: 0xffd080 });
  let lastTick = -1;

  function sync(alpha: number) {
    for (const [i, t] of s.towers) if (!towers.has(i)) { const m = at(box(TOWER_LOOK[t.kind].color, TOWER_LOOK[t.kind].size), i); towers.set(i, m); scene.add(m); }
    for (const [i, m] of towers) if (!s.towers.has(i)) { scene.remove(m); towers.delete(i); }

    const alive = new Set<number>();
    for (const e of s.enemies) {
      alive.add(e.id);
      let m = enemies.get(e.id);
      if (!m) { m = box(ENEMY_LOOK[e.kind].color, ENEMY_LOOK[e.kind].size); enemies.set(e.id, m); scene.add(m); }
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
      m.position.set(wx(x), 0, wz(y));
      m.scale.y = 0.3 + 0.7 * (e.hp / e.maxHp); // greybox : la taille montre les PV
    }
    for (const [id, m] of enemies) if (!alive.has(id)) { scene.remove(m); enemies.delete(id); }

    if (s.tick !== lastTick) {
      lastTick = s.tick;
      for (const sh of s.shots) {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(wx(sh.fromX), 1, wz(sh.fromY)), new THREE.Vector3(wx(sh.toX), 0.3, wz(sh.toY)),
        ]);
        const line = new THREE.Line(g, shotMat);
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
  gui.add(psx, 'dither').name('dithering');
  gui.add(psx, 'colorBits', 3, 8, 1).name('bits / canal');
  gui.add(fog, 'near', 0, 40).name('brouillard début');
  gui.add(fog, 'far', 5, 120).name('brouillard fin');
  gui.addColor({ c: '#' + horizon.getHexString() }, 'c').name('horizon').onChange((v: string) => { horizon.set(v); fog.color.copy(horizon); });
  gui.add(cam, 'height', 3, 20).name('caméra hauteur').onChange(placeCamera);
  gui.add(cam, 'back', 4, 20).name('caméra recul').onChange(placeCamera);
  gui.add(cam, 'lookZ', -8, 4).name('caméra visée').onChange(placeCamera);
  gui.hide();
  addEventListener('keydown', (ev) => { if (ev.key === 'p') gui.show(gui._hidden); });

  return { renderer, sync, pickCell, cellToScreen, setHover };
}
