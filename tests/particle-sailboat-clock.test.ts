import test from 'node:test'
import assert from 'node:assert/strict'
import { ShaderMaterial } from 'three'
import { applyProps } from '@react-three/fiber'
import { advanceSailClock } from '../src/renderer/src/components/home/sailClock.ts'

test('R3F 复制 uniform 后更新实际材质时间，连续帧仍递增', () => {
  const input = { time: { value: 0 } }
  const material = new ShaderMaterial()
  try {
    applyProps(material, { uniforms: input })
    assert.notEqual(material.uniforms.time, input.time)
    let elapsed = 0
    for(let i=0;i<120;i++) elapsed = advanceSailClock(material, elapsed, 1/60)
    assert.ok(material.uniforms.time.value > 1.9)
    assert.equal(material.uniforms.time.value, elapsed)
    assert.equal(input.time.value, 0)
    const before = elapsed
    elapsed = advanceSailClock(material, elapsed, 60)
    assert.ok(elapsed-before<=.051, '恢复前台时不能瞬间跳过整段动画')
  } finally { material.dispose() }
})
