// Contenu du jeu. Distances en cases, durées en ticks (30/s), vitesses en cases/s.

export interface TowerLevel {
  cost: number;
  range: number;
  damage: number;      // par tir (chapelle : seulement contre les démons)
  cooldown: number;
  splash?: number;     // rayon des dégâts de zone
  burn?: number;       // brûlure : dégâts/s pendant BURN_TICKS, ignore l'armure
  slow?: number;       // aura : multiplicateur de vitesse pendant SLOW_TICKS, sur tous les ennemis à portée
}
export const BURN_TICKS = 60;
export const SLOW_TICKS = 40;

export const TOWERS = {
  crossbow: { name: 'Arbalétriers', levels: [
    { cost: 50, range: 3.5, damage: 10, cooldown: 15 },
    { cost: 45, range: 3.8, damage: 16, cooldown: 13 },
    { cost: 70, range: 4.2, damage: 26, cooldown: 11 },
  ] },
  bombard: { name: 'Bombarde', levels: [
    { cost: 80, range: 3, damage: 22, cooldown: 45, splash: 1.2 },
    { cost: 70, range: 3.2, damage: 34, cooldown: 42, splash: 1.35 },
    { cost: 110, range: 3.5, damage: 52, cooldown: 40, splash: 1.5 },
  ] },
  brazier: { name: 'Brasier', levels: [
    { cost: 70, range: 2.2, damage: 4, cooldown: 12, splash: 0.8, burn: 8 },
    { cost: 60, range: 2.4, damage: 6, cooldown: 11, splash: 0.9, burn: 14 },
    { cost: 90, range: 2.6, damage: 9, cooldown: 10, splash: 1, burn: 22 },
  ] },
  chapel: { name: 'Chapelle', levels: [
    { cost: 90, range: 2.5, damage: 8, cooldown: 20, slow: 0.65 },
    { cost: 75, range: 2.8, damage: 14, cooldown: 18, slow: 0.55 },
    { cost: 110, range: 3.1, damage: 22, cooldown: 16, slow: 0.45 },
  ] },
} satisfies Record<string, { name: string; levels: TowerLevel[] }>;
export type TowerKind = keyof typeof TOWERS;

export interface EnemyDef { name: string; hp: number; speed: number; reward: number; leak: number; armor: number; demon: boolean }
export const ENEMIES = {
  ghoul: { name: 'Goule', hp: 40, speed: 1.2, reward: 5, leak: 1, armor: 0, demon: false },
  hound: { name: 'Chien-démon', hp: 22, speed: 2.6, reward: 4, leak: 1, armor: 0, demon: true },
  knight: { name: 'Chevalier déchu', hp: 100, speed: 0.8, reward: 12, leak: 2, armor: 4, demon: false },
  apostle: { name: 'Apôtre', hp: 1500, speed: 0.55, reward: 150, leak: 15, armor: 4, demon: true },
} satisfies Record<string, EnemyDef>;
export type EnemyKind = keyof typeof ENEMIES;

/** Boss : à chaque seuil de PV franchi, invoque des renforts ; sous le dernier seuil, accélère. */
export const APOSTLE = { thresholds: [0.66, 0.33], summon: { kind: 'hound' as EnemyKind, count: 4 }, enrage: 1.6 };

export interface Wave {
  hpMul: number;
  groups: { kind: EnemyKind; count: number; every: number }[]; // groupes joués l'un après l'autre
}

export interface Level {
  name: string;
  map: string[]; // '.' libre, '#' rocher, 'S' apparition, 'G' porte
  gold: number;
  lives: number;
  waves: Wave[];
}

const w = (hpMul: number, ...groups: [EnemyKind, number, number][]): Wave =>
  ({ hpMul, groups: groups.map(([kind, count, every]) => ({ kind, count, every })) });

export const LEVELS: Level[] = [
  {
    name: 'Les Marches Cendrées',
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
      w(1, ['ghoul', 8, 30]),
      w(1.2, ['ghoul', 12, 25]),
      w(1.4, ['hound', 10, 15]),
      w(1.7, ['ghoul', 15, 20], ['hound', 10, 15]),
      w(2, ['ghoul', 25, 15], ['hound', 20, 10]),
    ],
  },
  {
    name: 'Le Gué des Pendus',
    map: [
      '....#...........',
      '....#.....##....',
      '....#.....##....',
      '..........##....',
      '.......#........',
      'S......#.......G',
      '.......#........',
      '..##........#...',
      '..##........#...',
      '............#...',
      '.....##.........',
      '.....##.........',
    ],
    gold: 200,
    lives: 20,
    waves: [
      w(1.2, ['ghoul', 10, 25]),
      w(1.3, ['hound', 12, 14]),
      w(1, ['knight', 4, 60], ['ghoul', 10, 20]),
      w(1.5, ['ghoul', 15, 18], ['hound', 12, 12]),
      w(1.1, ['knight', 8, 45]),
      w(1.8, ['hound', 25, 8]),
      w(1.8, ['knight', 10, 35], ['ghoul', 25, 12], ['hound', 20, 10]),
    ],
  },
  {
    name: 'La Brèche de l’Éclipse',
    map: [
      'S...............',
      '....###.........',
      '..........#.....',
      '..#.......#..##.',
      '..#..##...#.....',
      '..#..##.........',
      '.........##.....',
      '.###.....##..#..',
      '.............#..',
      '......###....#..',
      '...............G',
      '................',
    ],
    gold: 250,
    lives: 20,
    waves: [
      w(1.5, ['ghoul', 15, 20]),
      w(1.3, ['knight', 6, 45], ['hound', 10, 12]),
      w(2, ['hound', 30, 8]),
      w(1.2, ['knight', 12, 30]),
      w(2.2, ['ghoul', 30, 10], ['hound', 20, 8]),
      w(1.5, ['knight', 15, 25]),
      w(2.5, ['hound', 40, 6], ['ghoul', 30, 10]),
      w(1, ['apostle', 1, 1], ['knight', 10, 40]),
    ],
  },
];
