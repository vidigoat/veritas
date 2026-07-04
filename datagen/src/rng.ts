/** Deterministic PRNG (mulberry32) — same seed → byte-identical corpus. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    amount: (min: number, max: number) => Math.round((min + next() * (max - min)) * 100) / 100,
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof makeRng>;
