import { sfx, toggleMute } from './audio';
import { LEVELS, TOWERS, type TowerKind } from './data/content';
import { createView, loadModels } from './render/scene';
import {
  canPlace, createGame, placeTower, sellTower, sellValue, startWave, step, TICK_HZ, towerAt, upgradeCost, upgradeTower,
} from './sim/game';

// --- Campagne : ?level=N lance une carte ; sans paramètre, menu par-dessus la carte 1 ---
const SAVE_KEY = 'iron-vigil:unlocked';
const unlocked = () => { try { return Number(localStorage.getItem(SAVE_KEY)) || 0; } catch { return 0; } };
const unlock = (n: number) => { try { if (n > unlocked()) localStorage.setItem(SAVE_KEY, String(n)); } catch { /* stockage indisponible */ } };
const param = new URLSearchParams(location.search).get('level');
const levelIndex = Math.min(Math.max(Number(param) || 0, 0), LEVELS.length - 1);
const inMenu = param === null;
const go = (q: string) => { location.search = q; };

const state = createGame(LEVELS[levelIndex]);
const view = createView(document.body, state, await loadModels([
  'tower_crossbow', 'enemy_ghoul', 'decor_gate', 'decor_rock', 'decor_ground', 'decor_spawn',
]));
const $ = (id: string) => document.getElementById(id)!;
const button = (label: string, onclick: () => void, parent: HTMLElement) => {
  const b = document.createElement('button'); b.textContent = label; b.onclick = onclick; parent.appendChild(b); return b;
};

if (inMenu) {
  $('menu').hidden = false;
  LEVELS.forEach((l, i) => { button(`${i + 1}. ${l.name}`, () => go(`?level=${i}`), $('levels')).disabled = i > unlocked(); });
}

// --- HUD ---
const towerKinds = Object.keys(TOWERS) as TowerKind[];
let building: TowerKind = 'crossbow';
let selected: [number, number] | null = null; // tour sélectionnée
const towerButtons = towerKinds.map((kind, n) => {
  const b = button(`${n + 1}. ${TOWERS[kind].name} (${TOWERS[kind].levels[0]!.cost})`, () => { building = kind; selected = null; }, $('towers'));
  return { kind, b };
});
const waveButton = $('wave') as HTMLButtonElement;
const launchWave = () => { if (startWave(state)) sfx.wave(); };
waveButton.onclick = launchWave;
const upgradeButton = $('upgrade') as HTMLButtonElement;
const sellButton = $('sell') as HTMLButtonElement;
const upgrade = () => { if (selected) upgradeTower(state, ...selected); };
const sell = () => { if (selected && sellTower(state, ...selected)) selected = null; };
upgradeButton.onclick = upgrade;
sellButton.onclick = sell;
$('levelName').textContent = state.level.name;

let ended = false;
function updateHud() {
  $('gold').textContent = String(state.gold);
  $('lives').textContent = String(state.lives);
  $('waveNum').textContent = `${state.wave}/${state.level.waves.length}`;
  waveButton.disabled = state.waveActive || state.status !== 'playing';
  for (const { kind, b } of towerButtons) {
    b.classList.toggle('selected', kind === building && !selected);
    b.disabled = state.gold < TOWERS[kind].levels[0]!.cost;
  }

  const t = selected && towerAt(state, ...selected);
  $('panel').hidden = !t;
  if (t) {
    const cost = upgradeCost(t);
    $('panelName').textContent = `${TOWERS[t.kind].name} — niveau ${t.level + 1}/3`;
    upgradeButton.textContent = cost == null ? 'Niveau max' : `Améliorer (${cost}) [U]`;
    upgradeButton.disabled = cost == null || state.gold < cost;
    sellButton.textContent = `Vendre (+${sellValue(t)}) [V]`;
    view.showRange(t.x, t.y, TOWERS[t.kind].levels[t.level]!.range);
  }

  if (state.status !== 'playing' && !ended) {
    ended = true;
    const won = state.status === 'won';
    if (won) unlock(levelIndex + 1);
    $('message').textContent = won ? 'Victoire' : 'Défaite';
    $('end').hidden = false;
    if (won && levelIndex + 1 < LEVELS.length) button('Carte suivante', () => go(`?level=${levelIndex + 1}`), $('end'));
    if (!won) button('Réessayer', () => go(`?level=${levelIndex}`), $('end'));
    button('Menu', () => go(''), $('end'));
  }
}

// --- Entrées : glisser = caméra, clic = poser / sélectionner, clic droit = vendre, 1-4 = tour, U/V, Espace = vague ---
const canvas = view.renderer.domElement;
canvas.addEventListener('pointermove', (ev) => {
  const c = view.pickCell(ev.clientX, ev.clientY);
  view.setHover(c, !!c && canPlace(state, ...c) && state.gold >= TOWERS[building].levels[0]!.cost);
  if (!selected) view.showRange(c?.[0] ?? 0, c?.[1] ?? 0, c && !towerAt(state, ...c) ? TOWERS[building].levels[0]!.range : null);
});
canvas.addEventListener('pointerleave', () => { view.setHover(null, false); if (!selected) view.showRange(0, 0, null); });
let downX = 0, downY = 0;
canvas.addEventListener('pointerdown', (ev) => { downX = ev.clientX; downY = ev.clientY; });
canvas.addEventListener('click', (ev) => {
  if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 5) return; // c'était une rotation de caméra
  const c = view.pickCell(ev.clientX, ev.clientY);
  if (!c) return;
  if (towerAt(state, ...c)) { selected = c; return; }
  if (selected) { selected = null; view.showRange(0, 0, null); return; } // clic dans le vide : désélectionne
  placeTower(state, building, ...c);
});
canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const c = view.pickCell(ev.clientX, ev.clientY);
  if (c && sellTower(state, ...c) && selected?.[0] === c[0] && selected[1] === c[1]) selected = null;
});
addEventListener('keydown', (ev) => {
  const t = towerButtons[Number(ev.key) - 1];
  if (t) { building = t.kind; selected = null; }
  if (ev.key === 'u') upgrade();
  if (ev.key === 'v') sell();
  if (ev.key === 'Escape') selected = null;
  if (ev.key === 'm') toggleMute();
  if (ev.code === 'Space') { ev.preventDefault(); launchWave(); }
});

/** Un pas de sim + les sons de ce qui s'y est passé (au plus un son de chaque sorte). */
function tick() {
  const lives = state.lives, ids = new Set(state.enemies.map((e) => e.id)), status = state.status;
  step(state);
  for (const k of new Set(state.shots.map((sh) => sh.kind))) sfx.shot(k);
  const now = new Set(state.enemies.map((e) => e.id));
  if (state.lives < lives) sfx.leak();
  else if ([...ids].some((id) => !now.has(id))) sfx.death();
  if (status === 'playing' && state.status === 'won') sfx.won();
  if (status === 'playing' && state.status === 'lost') sfx.lost();
}

// --- Boucle : pas fixe pour la sim, rendu interpolé ---
const DT = 1000 / TICK_HZ;
let acc = 0, last = performance.now(), paused = inMenu, frames = 0;
view.renderer.setAnimationLoop((now) => {
  if (!paused) acc += Math.min(now - last, 250);
  last = now;
  while (acc >= DT) { tick(); acc -= DT; }
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
    level: levelIndex, gold: state.gold, lives: state.lives, wave: state.wave, waveActive: state.waveActive,
    status: state.status, towers: [...state.towers.values()].map((t) => ({ kind: t.kind, level: t.level })), enemies: state.enemies.length,
  }),
};
