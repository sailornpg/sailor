export type GridPoint = { x: number; y: number };
export type GridParticle = { from: GridPoint; to: GridPoint; fromBoat: boolean; survives: boolean; delay: number };

export function createParticleGrid(width: number, height: number): GridPoint[] {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) return [];
  const columns = Math.max(1, Math.ceil(width / 20));
  const rows = Math.max(1, Math.ceil(height / 20));
  const left = (width - (columns - 1) * 20) / 2;
  const top = (height - (rows - 1) * 20) / 2;
  return Array.from({ length: columns * rows }, (_, i) => ({ x: left + i % columns * 20, y: top + Math.floor(i / columns) * 20 }));
}

export function mapBoatToGrid(boat: GridPoint[], grid: GridPoint[]): GridParticle[] {
  const used = new Set<number>();
  // Spread assigned destinations across the whole grid, including when there are fewer boat points.
  const count = Math.min(boat.length, grid.length);
  const particles = boat.map((from, i) => {
    const target = i < count ? Math.floor(i * grid.length / count) : -1;
    used.add(target);
    return { from, to: grid[target] ?? from, fromBoat: true, survives: target >= 0, delay: (i % 11) / 100 };
  });
  grid.forEach((to, i) => {
    if (!used.has(i)) particles.push({ from: to, to, fromBoat: false, survives: true, delay: 0 });
  });
  return particles;
}

export function transitionPoint(particle: GridParticle, progress: number): GridPoint & { alpha: number } {
  const t = Math.max(0, Math.min(1, (progress - particle.delay) / (1 - particle.delay)));
  const eased = 1 - (1 - t) ** 3;
  const arc = Math.sin(Math.PI * t) * 0.12;
  const dx = particle.to.x - particle.from.x;
  const dy = particle.to.y - particle.from.y;
  const startAlpha = particle.fromBoat ? 0.8 : 0;
  const endAlpha = particle.survives ? 0.44 : 0;
  return {
    x: t === 1 ? particle.to.x : particle.from.x + dx * eased - dy * arc,
    y: t === 1 ? particle.to.y : particle.from.y + dy * eased + dx * arc,
    alpha: t === 1 ? endAlpha : startAlpha + (endAlpha - startAlpha) * eased,
  };
}
