import assert from 'node:assert/strict';
import test from 'node:test';
import { createParticleGrid, mapBoatToGrid, transitionPoint } from '../src/renderer/src/components/home/particleGrid.ts';

test('网格覆盖区域且横竖严格等距，尺寸改变仍保持 20px 间距', () => {
  for (const [width, height] of [[100, 60], [421, 733], [12, 30], [840, 600]]) {
    const grid = createParticleGrid(width, height);
    const xs = [...new Set(grid.map(p => p.x))].sort((a,b) => a-b);
    const ys = [...new Set(grid.map(p => p.y))].sort((a,b) => a-b);
    assert.ok(grid.length > 0);
    assert.equal(grid.length, xs.length * ys.length);
    for (const axis of [xs, ys]) for (let i=1; i<axis.length; i++) assert.equal(axis[i]-axis[i-1], 20);
    assert.ok(xs[0] >= 0 && xs.at(-1)! <= width && xs[0] <= 10);
    assert.ok(ys[0] >= 0 && ys.at(-1)! <= height && ys[0] <= 10);
    assert.deepEqual(grid, createParticleGrid(width, height));
  }
});

test('零尺寸与无效尺寸返回空网格', () => {
  for (const [w,h] of [[0,20], [20,0], [-1,20], [NaN,20], [Infinity,20]]) assert.deepEqual(createParticleGrid(w,h), []);
});

test('船多于或少于网格时终点不重叠、网格完整且无多余亮点', () => {
  const boat = Array.from({length: 20}, (_,i) => ({x: i, y: i*2}));
  for (const grid of [createParticleGrid(200,100), createParticleGrid(20,40)]) {
    const particles = mapBoatToGrid(boat,grid);
    assert.equal(particles.filter(p=>p.fromBoat).length,boat.length);
    const final = particles.map(p=>transitionPoint(p,1)).filter(p=>p.alpha>0);
    assert.equal(final.length,grid.length);
    assert.equal(new Set(final.map(p=>`${p.x},${p.y}`)).size,grid.length);
    assert.deepEqual(final.map(p=>`${p.x},${p.y}`).sort(),grid.map(p=>`${p.x},${p.y}`).sort());
    assert.ok(final.every(p=>p.alpha===0.44));
    assert.deepEqual(particles,mapBoatToGrid(boat,grid));
  }
});

test('起点保持船形，补点不可见，中途坐标有限，终点准确落格', () => {
  const particles=mapBoatToGrid([{x:50,y:30},{x:60,y:40}],createParticleGrid(200,100));
  assert.deepEqual(particles.slice(0,2).map(p=>transitionPoint(p,0)).map(p=>({x:p.x,y:p.y})),[{x:50,y:30},{x:60,y:40}]);
  assert.ok(particles.slice(2).every(p=>transitionPoint(p,0).alpha===0));
  for (const t of [0,0.2,0.5,0.99,1]) for(const p of particles) assert.ok(Object.values(transitionPoint(p,t)).every(Number.isFinite));
});
