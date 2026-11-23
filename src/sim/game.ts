// Simulation pure et déterministe : aucun import Three.js/DOM.
import { APOSTLE, BURN_TICKS, ENEMIES, LEVELS, SLOW_TICKS, TOWERS, type EnemyKind, type Level, type TowerKind } from '../data/content';
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
  burnDps: number; burnTicks: number;
  slowMul: number; slowTicks: number;
  phase: number;          // boss : seuils de PV déjà franchis
}
export interface Tower { kind: TowerKind; x: number; y: number; level: number; invested: number; cooldown: number }
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
  shots: Shot[]; // tirs du dernier tick (pour le rendu) ; aura = tir sur soi-même
  status: 'playing' | 'won' | 'lost';
}

export function createGame(level: Level = LEVELS[0]!): GameState {
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
export const towerAt = (s: GameState, x: number, y: number) => s.towers.get(cell(s, x, y));
/** Coût du prochain niveau, ou null si la tour est au maximum. */
export const upgradeCost = (t: Tower) => TOWERS[t.kind].levels[t.level + 1]?.cost ?? null;
export const sellValue = (t: Tower) => Math.floor(t.invested * SELL_RATIO);

export function placeTower(s: GameState, kind: TowerKind, x: number, y: number): boolean {
  const cost = TOWERS[kind].levels[0]!.cost;
  if (s.status !== 'playing' || s.gold < cost) return false;
  const dist = fieldWithTower(s, x, y);
  if (!dist) return false;
  s.gold -= cost;
  s.towers.set(cell(s, x, y), { kind, x, y, level: 0, invested: cost, cooldown: 0 });
  s.dist = dist;
  return true;
}

export function upgradeTower(s: GameState, x: number, y: number): boolean {
  const t = towerAt(s, x, y), cost = t && upgradeCost(t);
  if (s.status !== 'playing' || !t || cost == null || s.gold < cost) return false;
  s.gold -= cost;
  t.level++;
  t.invested += cost;
  return true;
}

export function sellTower(s: GameState, x: number, y: number): boolean {
  const i = cell(s, x, y), t = s.towers.get(i);
  if (s.status !== 'playing' || !t) return false;
  s.towers.delete(i);
  s.gold += sellValue(t);
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

function spawnEnemy(s: GameState, kind: EnemyKind, x: number, y: number, tx = x, ty = y) {
  const hp = Math.round(ENEMIES[kind].hp * s.level.waves[s.wave - 1]!.hpMul);
  s.enemies.push({ id: s.nextId++, kind, hp, maxHp: hp, x, y, px: x, py: y, tx, ty, burnDps: 0, burnTicks: 0, slowMul: 1, slowTicks: 0, phase: 0 });
}

/** Distance restante jusqu'à la porte : sert au ciblage (« le plus avancé d'abord »). */
const remaining = (s: GameState, e: Enemy) => s.dist[cell(s, e.tx, e.ty)]! + Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
const hit = (e: Enemy, damage: number) => { e.hp -= Math.max(1, damage - ENEMIES[e.kind].armor); };

function speedOf(e: Enemy) {
  const enraged = e.kind === 'apostle' && e.phase >= APOSTLE.thresholds.length ? APOSTLE.enrage : 1;
  return ENEMIES[e.kind].speed * (e.slowTicks > 0 ? e.slowMul : 1) * enraged;
}

export function step(s: GameState): void {
  if (s.status !== 'playing') return;
  s.tick++;
  s.shots = [];

  // Apparitions
  if (s.waveActive) {
    while (s.spawnQueue.length && s.spawnQueue[0]!.at <= s.waveTick) {
      spawnEnemy(s, s.spawnQueue.shift()!.kind, s.spawn % s.w, (s.spawn / s.w) | 0);
    }
    s.waveTick++;
  }

  // Effets persistants
  for (const e of s.enemies) {
    if (e.burnTicks > 0) { e.hp -= e.burnDps / TICK_HZ; e.burnTicks--; }
    if (e.slowTicks > 0) e.slowTicks--;
  }

  // Déplacements le long du flow field
  for (const e of s.enemies) {
    e.px = e.x; e.py = e.y;
    let move = speedOf(e) / TICK_HZ;
    while (move > 0) {
      const d = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y); // déplacement toujours axial
      if (d > move) {
        e.x += Math.sign(e.tx - e.x) * move;
        e.y += Math.sign(e.ty - e.y) * move;
        break;
      }
      e.x = e.tx; e.y = e.ty; move -= d;
      const here = s.dist[cell(s, e.x, e.y)]!;
      if (here === 0) { e.hp = -Infinity; s.lives -= ENEMIES[e.kind].leak; break; } // atteint la porte
      for (const [dx, dy] of DIRS) {
        const nx = e.x + dx, ny = e.y + dy;
        if (nx >= 0 && ny >= 0 && nx < s.w && ny < s.h && s.dist[cell(s, nx, ny)] === here - 1) { e.tx = nx; e.ty = ny; break; }
      }
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp !== -Infinity);

  // Tirs
  for (const t of s.towers.values()) {
    if (--t.cooldown > 0) continue;
    const def = TOWERS[t.kind].levels[t.level]!;
    const inRange = s.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= def.range);
    if (!inRange.length) continue;
    t.cooldown = def.cooldown;

    if ('slow' in def) { // aura : ralentit tout, blesse les démons
      s.shots.push({ kind: t.kind, fromX: t.x, fromY: t.y, toX: t.x, toY: t.y });
      for (const e of inRange) {
        e.slowMul = Math.min(e.slowTicks > 0 ? e.slowMul : 1, def.slow); e.slowTicks = SLOW_TICKS;
        if (ENEMIES[e.kind].demon) hit(e, def.damage);
      }
      continue;
    }
    const target = inRange.reduce((a, b) => (remaining(s, b) < remaining(s, a) ? b : a));
    s.shots.push({ kind: t.kind, fromX: t.x, fromY: t.y, toX: target.x, toY: target.y });
    for (const e of s.enemies) {
      if (e !== target && !('splash' in def && Math.hypot(e.x - target.x, e.y - target.y) <= def.splash)) continue;
      hit(e, def.damage);
      if ('burn' in def) { e.burnDps = Math.max(e.burnTicks > 0 ? e.burnDps : 0, def.burn); e.burnTicks = BURN_TICKS; }
    }
  }

  // Boss : invocations aux seuils de PV
  for (const e of [...s.enemies]) {
    while (e.kind === 'apostle' && e.hp > 0 && e.phase < APOSTLE.thresholds.length && e.hp / e.maxHp < APOSTLE.thresholds[e.phase]!) {
      e.phase++;
      for (let n = 0; n < APOSTLE.summon.count; n++) spawnEnemy(s, APOSTLE.summon.kind, e.x, e.y, e.tx, e.ty);
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
