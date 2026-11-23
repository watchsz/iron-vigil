// Contenu du jeu (greybox). Distances en cases, durées en ticks (30/s), vitesses en cases/s.

export const TOWERS = {
  crossbow: { name: 'Arbalétriers', cost: 50, range: 3.5, damage: 10, cooldown: 15, splash: 0 },
  bombard: { name: 'Bombarde', cost: 80, range: 3, damage: 22, cooldown: 45, splash: 1.2 },
} as const;
export type TowerKind = keyof typeof TOWERS;

export const ENEMIES = {
  ghoul: { name: 'Goule', hp: 40, speed: 1.2, reward: 5, leak: 1 },
  hound: { name: 'Chien-démon', hp: 22, speed: 2.6, reward: 4, leak: 1 },
} as const;
export type EnemyKind = keyof typeof ENEMIES;

export interface Wave {
  hpMul: number;
  groups: { kind: EnemyKind; count: number; every: number }[]; // groupes joués l'un après l'autre
}

export interface Level {
  map: string[]; // '.' libre, '#' rocher, 'S' apparition, 'G' porte
  gold: number;
  lives: number;
  waves: Wave[];
}

export const LEVEL: Level = {
  map: [
    '................',
    '................',
    '...#........#...',
    '...#........#...',
    '................',
    '.......##.......',
    'S..............G',
    '.......##.......',
    '................',
    '...#........#...',
    '...#........#...',
    '................',
  ],
  gold: 150,
  lives: 20,
  waves: [
    { hpMul: 1, groups: [{ kind: 'ghoul', count: 8, every: 30 }] },
    { hpMul: 1.2, groups: [{ kind: 'ghoul', count: 12, every: 25 }] },
    { hpMul: 1.4, groups: [{ kind: 'hound', count: 10, every: 15 }] },
    { hpMul: 1.7, groups: [{ kind: 'ghoul', count: 15, every: 20 }, { kind: 'hound', count: 10, every: 15 }] },
    { hpMul: 2, groups: [{ kind: 'ghoul', count: 25, every: 15 }, { kind: 'hound', count: 20, every: 10 }] },
  ],
};
