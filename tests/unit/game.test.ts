import { expect, test } from 'vitest';
import { LEVELS, type Level, type TowerKind } from '../../src/data/content';
import {
  canPlace, createGame, placeTower, sellTower, startWave, step, upgradeCost, upgradeTower, towerAt, type GameState,
} from '../../src/sim/game';
import { DIRS, flowField } from '../../src/sim/pathing';

const tiny = (over: Partial<Level> = {}): Level => ({
  name: 't', map: ['S.G', '.#.', '...'], gold: 1000, lives: 1, waves: [], ...over,
});

test('flow field : plus court chemin en 4-voisins, contourne les obstacles', () => {
  const d = flowField(3, 3, (i) => i === 4, 8); // 3x3, mur au centre, but en (2,2)
  expect([...d]).toEqual([4, 3, 2, 3, -1, 1, 2, 1, 0]);
});

test('placement : coûte de l’or, refusé sur rocher, hors carte ou s’il bloque le chemin', () => {
  const s = createGame(tiny());
  expect(placeTower(s, 'crossbow', 1, 1)).toBe(false); // rocher
  expect(placeTower(s, 'crossbow', 5, 5)).toBe(false); // hors carte
  expect(placeTower(s, 'crossbow', 1, 0)).toBe(true);
  expect(s.gold).toBe(950);
  expect(s.dist[0]).toBe(6); // détour par le bas
  expect(placeTower(s, 'crossbow', 0, 1)).toBe(false); // fermerait le dernier chemin
});

test('amélioration : 3 niveaux max, revente à 70 % du total investi', () => {
  const s = createGame(tiny());
  placeTower(s, 'crossbow', 1, 0);
  expect(upgradeTower(s, 1, 0)).toBe(true);
  expect(upgradeTower(s, 1, 0)).toBe(true);
  expect(upgradeTower(s, 1, 0)).toBe(false);
  expect(upgradeCost(towerAt(s, 1, 0)!)).toBeNull();
  expect(s.gold).toBe(1000 - 50 - 45 - 70);
  expect(sellTower(s, 1, 0)).toBe(true);
  expect(s.gold).toBe(1000 - 165 + Math.floor(165 * 0.7));
  expect(s.dist[0]).toBe(2);
});

/** Ennemi seul au milieu d'un couloir, tour juste à côté. */
function duel(tower: TowerKind, enemy: 'ghoul' | 'hound' | 'knight' | 'apostle') {
  const s = createGame(tiny({ map: ['S.........G', '...........'], waves: [{ hpMul: 1, groups: [{ kind: enemy, count: 1, every: 1 }] }] }));
  placeTower(s, tower, 5, 1);
  startWave(s);
  return s;
}

test('armure : réduit chaque coup ; la brûlure l’ignore', () => {
  const a = duel('crossbow', 'knight');
  while (!a.shots.length) step(a);
  expect(a.enemies[0]!.hp).toBe(100 - (10 - 4));

  const b = duel('brazier', 'knight');
  while (!b.shots.length) step(b);
  const after = b.enemies[0]!.hp;
  for (let k = 0; k < 5; k++) step(b);
  expect(after - b.enemies[0]!.hp).toBeGreaterThanOrEqual(1); // brûle malgré l'armure
});

test('chapelle : ralentit tout le monde, ne blesse que les démons', () => {
  const g = duel('chapel', 'ghoul');
  while (!g.shots.length) step(g);
  expect(g.enemies[0]!.hp).toBe(40);
  expect(g.enemies[0]!.slowTicks).toBeGreaterThan(0);

  const h = duel('chapel', 'hound');
  while (!h.shots.length) step(h);
  expect(h.enemies[0]!.hp).toBe(22 - 8);
});

test('Apôtre : invoque des chiens aux seuils de PV', () => {
  const s = duel('crossbow', 'apostle');
  step(s);
  s.enemies[0]!.hp = 1500 * 0.6;
  step(s);
  expect(s.enemies.filter((e) => e.kind === 'hound')).toHaveLength(4);
  s.enemies[0]!.hp = 1500 * 0.3;
  step(s);
  expect(s.enemies.filter((e) => e.kind === 'hound').length).toBeGreaterThanOrEqual(8);
});

// --- Parties complètes jouées par une IA gloutonne ---
const ORDER: TowerKind[] = ['crossbow', 'bombard', 'brazier', 'crossbow', 'chapel', 'bombard'];

function pathCells(s: GameState) {
  const out: [number, number][] = [];
  let x = s.spawn % s.w, y = (s.spawn / s.w) | 0;
  while (s.dist[y * s.w + x]! > 0) {
    out.push([x, y]);
    const here = s.dist[y * s.w + x]!;
    const n = DIRS.map(([dx, dy]) => [x + dx, y + dy] as const)
      .find(([nx, ny]) => nx >= 0 && ny >= 0 && nx < s.w && ny < s.h && s.dist[ny * s.w + nx] === here - 1)!;
    [x, y] = n;
  }
  return out;
}

function bestCell(s: GameState): [number, number] | null {
  const path = pathCells(s);
  let best: [number, number] | null = null, bestScore = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (!canPlace(s, x, y)) continue;
    const score = path.filter(([px, py]) => Math.hypot(px - x, py - y) <= 2.5).length;
    if (score > bestScore) { best = [x, y]; bestScore = score; }
  }
  return best;
}

function play(level: Level, withTowers: boolean): GameState {
  const s = createGame(level);
  let n = 0;
  while (s.status === 'playing') {
    for (;;) { // construit tant que l'or suit : d'abord poser, sinon améliorer
      const kind = ORDER[n % ORDER.length]!;
      const c = withTowers && s.towers.size < 12 ? bestCell(s) : null; // au-delà : on améliore
      if (c && placeTower(s, kind, ...c)) { n++; continue; }
      const up = [...s.towers.values()].sort((a, b) => a.level - b.level).find((t) => upgradeTower(s, t.x, t.y));
      if (!up) break;
    }
    startWave(s);
    while (s.waveActive && s.status === 'playing') step(s);
  }
  return s;
}

test.each(LEVELS.map((l, i) => [i, l] as const))('carte %i : gagnable, perdue sans défense, déterministe', (_, level) => {
  const won = play(level, true);
  expect(won.status).toBe('won');
  expect(play(level, true)).toEqual(won);
  expect(play(level, false).status).toBe('lost');
});
