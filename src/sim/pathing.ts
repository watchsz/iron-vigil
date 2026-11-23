export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

/** Flow field : distance BFS (4-voisins) de chaque case jusqu'à `goal`, -1 si inatteignable. */
export function flowField(w: number, h: number, blocked: (i: number) => boolean, goal: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [goal];
  dist[goal] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[n] !== -1 || blocked(n)) continue;
      dist[n] = dist[i]! + 1;
      queue.push(n);
    }
  }
  return dist;
}
