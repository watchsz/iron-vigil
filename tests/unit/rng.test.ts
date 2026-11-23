import { expect, test } from 'vitest';
import { createRng } from '../../src/sim/rng';

test('même seed, même séquence ; seeds différents, séquences différentes', () => {
  const take = (seed: number) => { const r = createRng(seed); return [r(), r(), r()]; };
  expect(take(42)).toEqual(take(42));
  expect(take(42)).not.toEqual(take(43));
  for (const v of take(7)) expect(v >= 0 && v < 1).toBe(true);
});
