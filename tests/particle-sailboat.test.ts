import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleSailboat, pointerOnPlane, stepParticles, sailWaveWeight, sailWavePhase } from '../src/renderer/src/components/home/particleSimulation.ts'

test('船形采样确定、坐标有限并包含帆与船身', () => {
  const a = sampleSailboat()
  assert.deepEqual(a, sampleSailboat())
  assert.ok(a.length >= 1500 && a.length <= 2100)
  assert.ok(Array.from(a).every(Number.isFinite))
  const ys = Array.from(a).filter((_, i) => i % 3 === 1)
  assert.ok(Math.max(...ys) > 1 && Math.min(...ys) < -0.7)
})
test('指针按实际视口映射，缩放后同一相对位置对应同一平面坐标', () => {
  assert.deepEqual(pointerOnPlane(200, 100, { left: 0, top: 0, width: 400, height: 200 }, 6, 3), { x: 0, y: 0 })
  assert.deepEqual(pointerOnPlane(300, 50, { left: 0, top: 0, width: 400, height: 200 }, 6, 3), { x: 1.5, y: 0.75 })
  assert.deepEqual(pointerOnPlane(160, 45, { left: 10, top: 20, width: 200, height: 100 }, 6, 3), { x: 1.5, y: 0.75 })
  assert.equal(pointerOnPlane(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 6, 3), null)
})
test('局部排斥：近处撑开，远处不变，重合点保持有限', () => {
  const base = new Float32Array([0, 0, 0, 0.2, 0, 0, 3, 0, 0])
  const current = base.slice()
  assert.equal(stepParticles(current, base, { x: 0, y: 0 }, 1 / 60), true)
  assert.ok(Array.from(current).every(Number.isFinite))
  assert.ok(Math.hypot(current[0], current[1]) > 0)
  assert.ok(current[3] > base[3])
  assert.equal(current[6], 3)
})
test('不同帧率下复位收敛，稳定后停止请求帧', () => {
  const base = new Float32Array([0, 0, 0])
  const simulate = (fps: number, seconds: number) => {
    const current = new Float32Array([1, -1, 0.3])
    let moving = true
    for (let n = 0; n < fps * seconds; n++) moving = stepParticles(current, base, null, 1 / fps)
    return { current, moving }
  }
  assert.ok(Math.abs(simulate(30, 0.2).current[0] - simulate(120, 0.2).current[0]) < 0.00001)
  for (const fps of [30, 60, 120]) {
    const result = simulate(fps, 3)
    assert.deepEqual(result.current, base)
    assert.equal(result.moving, false)
  }
})

test('疏朗采样保留最小点间距，不让随机点团聚', () => {
  const points = sampleSailboat()
  for (let i = 0; i < points.length; i += 3) {
    for (let j = i + 3; j < points.length; j += 3) {
      assert.ok(Math.hypot(points[i] - points[j], points[i + 1] - points[j + 1]) >= 0.0349)
    }
  }
})

test('规则船形的行间距一致，帆边缘在直线上', () => {
  const points = sampleSailboat()
  const sail = []
  for (let i = 0; i < points.length; i += 3) {
    assert.equal(points[i + 2], 0)
    if (points[i] >= -0.00001 && points[i + 1] >= -0.20001) sail.push([points[i], points[i + 1]])
  }
  assert.equal(sail.length, 231)
  for (let row = 0; row <= 20; row++) {
    const y = -0.2 + row * 0.1
    const xs = sail.filter(p => Math.abs(p[1] - y) < 0.00001).map(p => p[0]).sort((a,b) => a-b)
    assert.equal(xs.length, 21-row)
    assert.ok(Math.abs(xs[0]) < 0.00001)
    assert.ok(Math.abs(xs.at(-1) - (1.5-row*0.075)) < 0.00001)
    for(let i=1;i<xs.length;i++) assert.ok(Math.abs(xs[i]-xs[i-1]-.075)<0.00001)
  }
})
test('风帆边缘随波纹轻微起伏，内部起伏更明显且船身保持固定', () => {
  for(const [x,y] of [[0,1.8],[0,.8],[.75,.8],[-.65,.4]]) assert.ok(sailWaveWeight(x,y)>=.2)
  for(const [x,y] of [[-.2,-.2],[0,-.7]]) assert.ok(sailWaveWeight(x,y)<.00001)
  assert.ok(sailWaveWeight(.5,.4)>.5)
})

test('波纹相位从左边缘递增，使相同波峰持续向右传播', () => {
  assert.equal(sailWavePhase(-1.1), 0)
  assert.ok(sailWavePhase(-.5) < sailWavePhase(0))
  assert.ok(sailWavePhase(0) < sailWavePhase(1.5))
  const angularSpeed = 1.8
  const x = -.5, advance = .4, time = 3
  const delay = (sailWavePhase(x + advance) - sailWavePhase(x)) / angularSpeed
  assert.ok(delay > 0)
  assert.ok(Math.abs(Math.sin(time * angularSpeed - sailWavePhase(x)) - Math.sin((time + delay) * angularSpeed - sailWavePhase(x + advance))) < 1e-8)
})
