// Simulation pure et déterministe : aucun import Three.js/DOM.
import { ENEMIES, LEVEL, TOWERS, type EnemyKind, type Level, type TowerKind } from '../data/content';
import { DIRS, flowField } from './pathing';

export const TICK_HZ = 30;
export const SELL_RATIO = 0.7;

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  x: number; y: number;   // position (cases, centre de case = entier)
  px: number; py: number; // position au tick précédent (interpolation du rendu)
  tx: number; ty: number; // case visée
}
export interface Tower { kind: TowerKind; x: number; y: number; cooldown: number }
export interface Shot { kind: TowerKind; fromX: number; fromY: number; toX: number; toY: number }

export interface GameState {
  level: Level;
  w: number; h: number;
  rocks: Uint8Array;
  spawn: number; goal: number;
  dist: Int32Array; // flow field courant vers la porte
  tick: number;
  gold: number;
  lives: number;
  wave: number; // nombre de vagues lancées
  waveActive: boolean;
  waveTick: number;
  spawnQueue: { kind: EnemyKind; at: number }[];
  towers: Map<number, Tower>; // clé = index de case
  enemies: Enemy[];
  nextId: number;
  shots: Shot[]; // tirs du dernier tick (pour le rendu)
  status: 'playing' | 'won' | 'lost';
}

export function createGame(level: Level = LEVEL): GameState {
  const h = level.map.length, w = level.map[0]!.length;
  const rocks = new Uint8Array(w * h);
  let spawn = -1, goal = -1;
  level.map.forEach((row, y) => [...row].forEach((c, x) => {
    const i = y * w + x;
    if (c === '#') rocks[i] = 1;
    if (c === 'S') spawn = i;
    if (c === 'G') goal = i;
  }));
  const s: GameState = {
    level, w, h, rocks, spawn, goal, dist: new Int32Array(0),
    tick: 0, gold: level.gold, lives: level.lives,
    wave: 0, waveActive: false, waveTick: 0, spawnQueue: [],
    towers: new Map(), enemies: [], nextId: 1, shots: [], status: 'playing',
  };
  s.dist = flowField(w, h, (i) => rocks[i] === 1, goal);
  return s;
}

const cell = (s: GameState, x: number, y: number) => y * s.w + x;

/** Flow field si on posait une tour en (x, y), ou null si le placement est interdit. */
function fieldWithTower(s: GameState, x: number, y: number): Int32Array | null {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  const i = cell(s, x, y);
  if (s.rocks[i] || s.towers.has(i) || i === s.spawn || i === s.goal) return null;
  if (s.enemies.some((e) => cell(s, e.tx, e.ty) === i || cell(s, Math.round(e.x), Math.round(e.y)) === i)) return null;
  const dist = flowField(s.w, s.h, (n) => n === i || s.rocks[n] === 1 || s.towers.has(n), s.goal);
  if (dist[s.spawn]! < 0 || s.enemies.some((e) => dist[cell(s, e.tx, e.ty)]! < 0)) return null; // bloquerait le chemin
  return dist;
}

export const canPlace = (s: GameState, x: number, y: number) => fieldWithTower(s, x, y) !== null;

export function placeTower(s: GameState, kind: TowerKind, x: number, y: number): boolean {
  if (s.status !== 'playing' || s.gold < TOWERS[kind].cost) return false;
  const dist = fieldWithTower(s, x, y);
  if (!dist) return false;
  s.gold -= TOWERS[kind].cost;
  s.towers.set(cell(s, x, y), { kind, x, y, cooldown: 0 });
  s.dist = dist;
  return true;
}

export function sellTower(s: GameState, x: number, y: number): boolean {
  const i = cell(s, x, y), t = s.towers.get(i);
  if (s.status !== 'playing' || !t) return false;
  s.towers.delete(i);
  s.gold += Math.floor(TOWERS[t.kind].cost * SELL_RATIO);
  s.dist = flowField(s.w, s.h, (n) => s.rocks[n] === 1 || s.towers.has(n), s.goal);
  return true;
}

export function startWave(s: GameState): boolean {
  if (s.status !== 'playing' || s.waveActive || s.wave >= s.level.waves.length) return false;
  let at = 0;
  s.spawnQueue = [];
  for (const g of s.level.waves[s.wave]!.groups) {
    for (let n = 0; n < g.count; n++, at += g.every) s.spawnQueue.push({ kind: g.kind, at });
  }
  s.wave++;
  s.waveActive = true;
  s.waveTick = 0;
  return true;
}

/** Distance restante jusqu'à la porte : sert au ciblage (« le plus avancé d'abord »). */
const remaining = (s: GameState, e: Enemy) => s.dist[cell(s, e.tx, e.ty)]! + Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);

export function step(s: GameState): void {
  if (s.status !== 'playing') return;
  s.tick++;
  s.shots = [];

  // Apparitions
  if (s.waveActive) {
    while (s.spawnQueue.length && s.spawnQueue[0]!.at <= s.waveTick) {
      const { kind } = s.spawnQueue.shift()!;
      const hp = Math.round(ENEMIES[kind].hp * s.level.waves[s.wave - 1]!.hpMul);
      const x = s.spawn % s.w, y = (s.spawn / s.w) | 0;
      s.enemies.push({ id: s.nextId++, kind, hp, maxHp: hp, x, y, px: x, py: y, tx: x, ty: y });
    }
    s.waveTick++;
  }

  // Déplacements le long du flow field
  for (const e of s.enemies) {
    e.px = e.x; e.py = e.y;
    let move = ENEMIES[e.kind].speed / TICK_HZ;
    while (move > 0) {
      const d = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y); // déplacement toujours axial
      if (d > move) {
        e.x += Math.sign(e.tx - e.x) * move;
        e.y += Math.sign(e.ty - e.y) * move;
        break;
      }
      e.x = e.tx; e.y = e.ty; move -= d;
      const here = s.dist[cell(s, e.x, e.y)]!;
      if (here === 0) { e.hp = 0; s.lives -= ENEMIES[e.kind].leak; break; } // atteint la porte
      for (const [dx, dy] of DIRS) {
        const nx = e.x + dx, ny = e.y + dy;
        if (nx >= 0 && ny >= 0 && nx < s.w && ny < s.h && s.dist[cell(s, nx, ny)] === here - 1) { e.tx = nx; e.ty = ny; break; }
      }
    }
  }
  const leaked = new Set(s.enemies.filter((e) => e.hp <= 0).map((e) => e.id));
  s.enemies = s.enemies.filter((e) => !leaked.has(e.id));

  // Tirs
  for (const t of s.towers.values()) {
    if (--t.cooldown > 0) continue;
    const def = TOWERS[t.kind];
    let target: Enemy | undefined;
    for (const e of s.enemies) {
      if (Math.hypot(e.x - t.x, e.y - t.y) > def.range) continue;
      if (!target || remaining(s, e) < remaining(s, target)) target = e;
    }
    if (!target) continue;
    t.cooldown = def.cooldown;
    s.shots.push({ kind: t.kind, fromX: t.x, fromY: t.y, toX: target.x, toY: target.y });
    for (const e of s.enemies) {
      if (e === target || (def.splash > 0 && Math.hypot(e.x - target.x, e.y - target.y) <= def.splash)) e.hp -= def.damage;
    }
  }
  for (const e of s.enemies) if (e.hp <= 0) s.gold += ENEMIES[e.kind].reward;
  s.enemies = s.enemies.filter((e) => e.hp > 0);

  if (s.lives <= 0) { s.lives = 0; s.status = 'lost'; return; }
  if (s.waveActive && !s.spawnQueue.length && !s.enemies.length) {
    s.waveActive = false;
    s.gold += 20 + 10 * s.wave;
    if (s.wave === s.level.waves.length) s.status = 'won';
  }
}
