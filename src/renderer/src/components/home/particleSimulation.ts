export type Pointer = { x: number; y: number } | null;

const REPEL_RADIUS = 0.78;
const REPEL_DISTANCE = 0.46;

export function sampleSailboat(): Float32Array {
  const points: number[] = [];
  // Integer rows preserve straight edges and uniform spacing without random jitter.
  for (let row = 0; row <= 20; row++) {
    for (let column = 0; column <= 20 - row; column++) {
      points.push(column * 0.075, -0.2 + row * 0.1, 0);
    }
  }
  for (let row = 0; row <= 12; row++) {
    for (let column = 0; column <= 12 - row; column++) {
      points.push(-0.2 - column * 0.075, -0.2 + row * 0.1, 0);
    }
  }
  for (let row = 0; row <= 6; row++) {
    for (let column = row; column <= 54 - row; column++) {
      points.push(-2.1 + column * 0.075, -0.4 - row * 0.1, 0);
    }
  }
  return new Float32Array(points);
}

export function sailWaveWeight(x: number, y: number): number {
  const height = y + 0.2;
  if (height <= 0) return 0;
  const u = x >= 0 ? x / 1.5 : (-0.2 - x) / 0.9;
  const v = height / (x >= 0 ? 2 : 1.2);
  if (u < 0 || v < 0 || u + v > 1) return 0;
  // Keep the boom attached while letting the sail outline flex with the wave.
  return 0.22 + 0.78 * 27 * u * v * (1 - u - v);
}

export function pointerOnPlane(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Pointer {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((x - rect.left) / rect.width - 0.5) * width,
    y: (0.5 - (y - rect.top) / rect.height) * height,
  };
}

export function stepParticles(
  current: Float32Array,
  base: Float32Array,
  pointer: Pointer,
  dt: number,
): boolean {
  const blend = 1 - Math.exp(-10 * Math.min(Math.max(dt, 0), 0.05));
  let moving = false;
  for (let index = 0; index < current.length; index += 3) {
    const x = current[index];
    const y = current[index + 1];
    let targetX = base[index];
    let targetY = base[index + 1];
    if (pointer) {
      let dx = targetX - pointer.x;
      let dy = targetY - pointer.y;
      let distance = Math.hypot(dx, dy);
      if (distance < REPEL_RADIUS) {
        const strength = (1 - distance / REPEL_RADIUS) ** 2;
        if (distance < 1e-5) {
          dx = 0.75;
          dy = 0.66;
          distance = 1;
        }
        targetX += (dx / distance) * REPEL_DISTANCE * strength;
        targetY += (dy / distance) * REPEL_DISTANCE * strength;
      }
    }
    current[index] = x + (targetX - x) * blend;
    current[index + 1] = y + (targetY - y) * blend;
    const dz = base[index + 2] - current[index + 2];
    current[index + 2] += dz * blend;
    if (
      Math.abs(targetX - current[index]) > 0.0005 ||
      Math.abs(targetY - current[index + 1]) > 0.0005 ||
      Math.abs(dz) > 0.0005
    )
      moving = true;
    else {
      current[index] = targetX;
      current[index + 1] = targetY;
      current[index + 2] = base[index + 2];
    }
  }
  return moving;
}


export function sailWavePhase(x: number): number { return (x + 1.1) * 3.6; }
