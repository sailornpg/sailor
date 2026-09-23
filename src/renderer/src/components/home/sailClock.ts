import type { ShaderMaterial } from 'three'

export function advanceSailClock(material: ShaderMaterial | null, elapsed: number, delta: number): number {
  const next = elapsed + Math.min(Math.max(delta, 0), 0.05)
  if (material?.uniforms.time) material.uniforms.time.value = next
  return next
}
