import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, DynamicDrawUsage, type BufferAttribute } from 'three';
import { createParticleGrid, mapBoatToGrid, transitionPoint, type GridParticle } from '../../home/particleGrid';
import { sampleSailboat, sailWavePhase, sailWaveWeight, stepParticles, type Pointer } from '../../home/particleSimulation';
import type { ParticleBackdropProps } from './ChatParticleBackdrop';

const silhouette = sampleSailboat();
const vertexShader = `
  uniform float dpr;
  attribute float opacity;
  attribute float diameter;
  varying float alpha;
  void main() {
    alpha = opacity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = diameter * dpr;
  }
`;
const fragmentShader = `
  uniform vec3 ink;
  varying float alpha;
  void main() {
    float a = (1.0 - smoothstep(.28, .5, length(gl_PointCoord - .5))) * alpha;
    if (a < .001) discard;
    gl_FragColor = vec4(ink, a);
    #include <colorspace_fragment>
  }
`;

function Particles({ phase, anchor, host, color, visible, onLost }: ParticleBackdropProps & { onLost: () => void }) {
  const { size, viewport, gl, invalidate } = useThree();
  const grid = useMemo(() => createParticleGrid(size.width, size.height), [size.width, size.height]);
  const count = Math.max(grid.length, silhouette.length / 3);
  const buffers = useMemo(() => ({ positions: new Float32Array(count * 3), opacity: new Float32Array(count), diameter: new Float32Array(count) }), [count]);
  const positions = useRef<BufferAttribute>(null);
  const opacity = useRef<BufferAttribute>(null);
  const diameter = useRef<BufferAttribute>(null);
  const local = useRef(silhouette.slice());
  const lastBoat = useRef<{ x: number; y: number }[]>([]);
  const pointer = useRef<Pointer>(null);
  const plan = useRef<GridParticle[] | null>(null);
  const elapsed = useRef(0);
  const travel = useRef(0);
  const oldPhase = useRef(phase);
  const oldGrid = useRef(grid);
  const uniforms = useMemo(() => ({ ink: { value: new Color(color) }, dpr: { value: viewport.dpr } }), [color, viewport.dpr]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (phase !== 'welcome' || !anchor || !host.current || event.pointerType === 'touch') return;
      const rect = host.current.getBoundingClientRect();
      const x = event.clientX - rect.left - anchor.left;
      const y = event.clientY - rect.top - anchor.top;
      pointer.current = x >= 0 && y >= 0 && x <= anchor.width && y <= anchor.height
        ? { x: (x / anchor.width - .5) * 6.4, y: (.5 - y / anchor.height) * 4 + .35 } : null;
    };
    const leave = () => { pointer.current = null; };
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    const element = host.current;
    element?.addEventListener('pointermove', move);
    element?.addEventListener('pointerleave', leave);
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      element?.removeEventListener('pointermove', move);
      element?.removeEventListener('pointerleave', leave);
      gl.domElement.removeEventListener('webglcontextlost', lost);
    };
  }, [phase, anchor, host, gl, onLost]);
  useEffect(() => { if (visible) invalidate(); }, [phase, anchor, uniforms, visible, grid, invalidate]);

  useFrame((_, delta) => {
    if (!visible) return;
    if (oldPhase.current !== phase || (phase === 'transition' && !plan.current)) {
      if (phase === 'transition') {
        // A cold lazy scene may mount after submission; start from its static fallback.
        if (!lastBoat.current.length && anchor) {
          lastBoat.current = Array.from({ length: silhouette.length / 3 }, (_, i) => ({
            x: anchor.left + anchor.width / 2 + silhouette[i * 3] * anchor.width / 6.4,
            y: anchor.top + anchor.height / 2 - (silhouette[i * 3 + 1] - .35) * anchor.width / 6.4,
          }));
        }
        plan.current = mapBoatToGrid(lastBoat.current, grid);
        travel.current = 0;
      }
      oldPhase.current = phase;
    }
    if (oldGrid.current !== grid) {
      if (phase === 'transition') plan.current = mapBoatToGrid(lastBoat.current, grid);
      oldGrid.current = grid;
    }
    buffers.opacity.fill(0);
    const write = (i: number, x: number, y: number, alpha: number, pointSize: number) => {
      buffers.positions[i * 3] = x - size.width / 2;
      buffers.positions[i * 3 + 1] = size.height / 2 - y;
      buffers.opacity[i] = alpha;
      buffers.diameter[i] = pointSize;
    };
    if (phase === 'welcome' && anchor) {
      elapsed.current += Math.min(delta, .05);
      stepParticles(local.current, silhouette, pointer.current, delta);
      const scale = anchor.width / 6.4;
      lastBoat.current = [];
      for (let i = 0; i < silhouette.length / 3; i++) {
        const x = silhouette[i * 3], y = silhouette[i * 3 + 1];
        const t = elapsed.current * 1.8 - sailWavePhase(x);
        const arrival = Math.max(0, Math.min(1, t / .6));
        const wave = Math.sin(t) * arrival * arrival * (3 - 2 * arrival) * sailWaveWeight(x, y);
        const px = anchor.left + anchor.width / 2 + (local.current[i * 3] + .15 * wave) * scale;
        const py = anchor.top + anchor.height / 2 - (local.current[i * 3 + 1] - .35 + .05 * wave) * scale;
        lastBoat.current.push({ x: px, y: py });
        write(i, px, py, .8, 1.8);
      }
    } else if (phase === 'transition' && plan.current) {
      travel.current = Math.min(1, travel.current + Math.min(delta, .05) / .8);
      plan.current.forEach((p, i) => {
        const point = transitionPoint(p, travel.current);
        write(i, point.x, point.y, point.alpha, p.fromBoat ? 1.8 - .2 * travel.current : 1.6);
      });
    } else if (phase === 'chat') {
      grid.forEach((p, i) => write(i, p.x, p.y, .44, 1.6));
    }
    for (const attribute of [positions, opacity, diameter]) if (attribute.current) attribute.current.needsUpdate = true;
  });
  return <points frustumCulled={false}>
    <bufferGeometry key={count}>
      <bufferAttribute ref={positions} attach="attributes-position" args={[buffers.positions, 3]} usage={DynamicDrawUsage} />
      <bufferAttribute ref={opacity} attach="attributes-opacity" args={[buffers.opacity, 1]} usage={DynamicDrawUsage} />
      <bufferAttribute ref={diameter} attach="attributes-diameter" args={[buffers.diameter, 1]} usage={DynamicDrawUsage} />
    </bufferGeometry>
    <shaderMaterial transparent depthWrite={false} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
  </points>;
}

export default function ChatParticleScene(props: ParticleBackdropProps & { onLost: () => void; fallback: React.ReactNode }) {
  return <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 1, near: .1, far: 20 }} dpr={[1, 1.5]}
    frameloop={!props.visible ? 'never' : props.phase === 'chat' ? 'demand' : 'always'}
    gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }} fallback={props.fallback}>
    <Particles {...props} />
  </Canvas>;
}
