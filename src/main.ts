import { TOWERS, type TowerKind } from './data/content';
import { createView } from './render/scene';
import { canPlace, createGame, placeTower, sellTower, startWave, step, TICK_HZ } from './sim/game';

const state = createGame();
const view = createView(document.body, state);
const $ = (id: string) => document.getElementById(id)!;

// --- HUD ---
let selected: TowerKind = 'crossbow';
const towerButtons = (Object.keys(TOWERS) as TowerKind[]).map((kind, n) => {
  const b = document.createElement('button');
  b.textContent = `${n + 1}. ${TOWERS[kind].name} (${TOWERS[kind].cost})`;
  b.onclick = () => { selected = kind; };
  $('towers').appendChild(b);
  return { kind, b };
});
const waveButton = $('wave') as HTMLButtonElement;
waveButton.onclick = () => startWave(state);

function updateHud() {
  $('gold').textContent = String(state.gold);
  $('lives').textContent = String(state.lives);
  $('waveNum').textContent = `${state.wave}/${state.level.waves.length}`;
  waveButton.disabled = state.waveActive || state.status !== 'playing';
  for (const { kind, b } of towerButtons) {
    b.classList.toggle('selected', kind === selected);
    b.disabled = state.gold < TOWERS[kind].cost;
  }
  $('message').textContent = state.status === 'won' ? 'Victoire' : state.status === 'lost' ? 'Défaite' : '';
}

// --- Entrées : clic = poser, clic droit = vendre (70 %), 1/2 = choix de tour, Espace = vague ---
const canvas = view.renderer.domElement;
canvas.addEventListener('pointermove', (ev) => {
  const c = view.pickCell(ev.clientX, ev.clientY);
  view.setHover(c, !!c && canPlace(state, ...c) && state.gold >= TOWERS[selected].cost);
});
canvas.addEventListener('pointerleave', () => view.setHover(null, false));
canvas.addEventListener('click', (ev) => {
  const c = view.pickCell(ev.clientX, ev.clientY);
  if (c) placeTower(state, selected, ...c);
});
canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const c = view.pickCell(ev.clientX, ev.clientY);
  if (c) sellTower(state, ...c);
});
addEventListener('keydown', (ev) => {
  const t = towerButtons[Number(ev.key) - 1];
  if (t) selected = t.kind;
  if (ev.code === 'Space') { ev.preventDefault(); startWave(state); }
});

// --- Boucle : pas fixe pour la sim, rendu interpolé ---
const DT = 1000 / TICK_HZ;
let acc = 0, last = performance.now(), paused = false, frames = 0;
view.renderer.setAnimationLoop((now) => {
  if (!paused) acc += Math.min(now - last, 250);
  last = now;
  while (acc >= DT) { step(state); acc -= DT; }
  view.sync(acc / DT);
  updateHud();
  frames++;
});

// Hook de test e2e
(window as unknown as { __game: object }).__game = {
  ready: true,
  frames: () => frames,
  drawCalls: () => view.renderer.info.render.calls,
  pause: (p: boolean) => { paused = p; acc = 0; },
  tick: (n: number) => { for (let k = 0; k < n; k++) step(state); },
  cellToScreen: view.cellToScreen,
  snapshot: () => ({
    gold: state.gold, lives: state.lives, wave: state.wave, waveActive: state.waveActive,
    status: state.status, towers: state.towers.size, enemies: state.enemies.length,
  }),
};
