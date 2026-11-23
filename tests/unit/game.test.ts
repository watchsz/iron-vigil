import { expect, test } from 'vitest';
import type { TowerKind } from '../../src/data/content';
import { createGame, placeTower, sellTower, startWave, step, type GameState } from '../../src/sim/game';
import { flowField } from '../../src/sim/pathing';

test('flow field : plus court chemin en 4-voisins, contourne les obstacles', () => {
  // 3x3, mur au centre, but en (2,2)
  const d = flowField(3, 3, (i) => i === 4, 8);
  expect([...d]).toEqual([4, 3, 2, 3, -1, 1, 2, 1, 0]);
});

test('placement : coûte de l’or, refusé sur rocher, hors carte ou s’il bloque le chemin', () => {
  const s = createGame({
    map: ['S.G', '.#.', '...'], gold: 1000, lives: 1, waves: [],
  });
  expect(placeTower(s, 'crossbow', 1, 1)).toBe(false); // rocher
  expect(placeTower(s, 'crossbow', 5, 5)).toBe(false); // hors carte
  expect(placeTower(s, 'crossbow', 1, 0)).toBe(true);
  expect(s.gold).toBe(950);
  expect(s.dist[0]).toBe(6); // détour par le bas
  expect(placeTower(s, 'crossbow', 0, 1)).toBe(false); // fermerait le dernier chemin
  expect(sellTower(s, 1, 0)).toBe(true);
  expect(s.gold).toBe(985); // revente à 70 %
  expect(s.dist[0]).toBe(2);
});

const PLAN: [TowerKind, number, number][] = [
  ['crossbow', 6, 5], ['crossbow', 9, 7], ['bombard', 6, 7], ['crossbow', 9, 5],
  ['bombard', 5, 6], ['crossbow', 10, 6], ['bombard', 7, 4], ['crossbow', 8, 8],
  ['bombard', 8, 4], ['crossbow', 7, 8], ['crossbow', 5, 4], ['crossbow', 10, 8],
];

/** Partie complète scriptée : avant chaque vague, construit le plan tant que l'or suit. */
function play(withTowers: boolean): GameState {
  const s = createGame();
  let next = 0;
  while (s.status === 'playing') {
    while (withTowers && next < PLAN.length && placeTower(s, ...PLAN[next]!)) next++;
    startWave(s);
    while (s.waveActive && s.status === 'playing') step(s);
  }
  return s;
}

test('partie scriptée : gagnée avec des tours, perdue sans, et déterministe', () => {
  const won = play(true);
  expect(won.status).toBe('won');
  expect(won.wave).toBe(5);
  expect(play(true)).toEqual(won); // même script = même résultat au tick près

  expect(play(false).status).toBe('lost');
});
