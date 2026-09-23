import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Color, DynamicDrawUsage, type BufferAttribute, type OrthographicCamera } from "three";
import { advanceSailClock } from "./sailClock";
import { pointerOnPlane, sampleSailboat, sailWavePhase, sailWaveWeight, stepParticles, type Pointer } from "./particleSimulation";

const WORLD_WIDTH = 6.4;
const vertexShader = `
  uniform float pixelRatio;
  uniform float time;
  attribute float sailWeight;
  attribute float sailPhase;
  void main() {
    float travel = time * 1.8 - sailPhase;
    float arrival = smoothstep(0.0, .6, travel);
    float ripple = sin(travel) * arrival * sailWeight;
    vec3 billowed = position + vec3(.15 * ripple, .05 * ripple, .18 * ripple);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(billowed, 1.0);
    gl_PointSize = 1.8 * pixelRatio;
  }
`;
const fragmentShader = `
  uniform vec3 ink;
  void main() {
    float d = length(gl_PointCoord - .5);
    float alpha = (1.0 - smoothstep(.28, .5, d)) * .8;
    if (alpha < .01) discard;
    gl_FragColor = vec4(ink, alpha);
    #include <colorspace_fragment>
  }
`;

function Boat({ color, visible, onContextLost }: { color: string; visible: boolean; onContextLost: () => void }) {
  const { gl, camera, size, viewport, invalidate } = useThree();
  const base = useMemo(sampleSailboat, []);
  const positions = useMemo(() => base.slice(), [base]);
  const wave = useMemo(() => {
    const weights = new Float32Array(base.length / 3);
    const phases = new Float32Array(base.length / 3);
    for (let i = 0; i < weights.length; i++) {
      weights[i] = sailWaveWeight(base[i * 3], base[i * 3 + 1]);
      phases[i] = sailWavePhase(base[i * 3]);
    }
    return { weights, phases };
  }, [base]);
  const attribute = useRef<BufferAttribute>(null);
  const material = useRef<import("three").ShaderMaterial>(null);
  const pointer = useRef<Pointer>(null);
  const uniforms = useMemo(() => ({ ink: { value: new Color(color) }, pixelRatio: { value: viewport.dpr }, time: { value: 0 } }), [color, viewport.dpr]);
  const elapsed = useRef(0);

  useEffect(() => {
    const ortho = camera as OrthographicCamera;
    ortho.zoom = size.width / WORLD_WIDTH;
    ortho.updateProjectionMatrix();
    pointer.current = null;
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const move = (event: PointerEvent) => {
      if (!visible || event.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      const point = pointerOnPlane(event.clientX, event.clientY, rect, WORLD_WIDTH, WORLD_WIDTH * rect.height / rect.width);
      pointer.current = point && { x: point.x, y: point.y + 0.35 };
      invalidate();
    };
    const leave = () => { pointer.current = null; invalidate(); };
    const lost = (event: Event) => { event.preventDefault(); onContextLost(); };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointercancel", leave);
    canvas.addEventListener("webglcontextlost", lost);
    pointer.current = null;
    if (visible) invalidate();
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
      canvas.removeEventListener("webglcontextlost", lost);
    };
  }, [gl, invalidate, visible, onContextLost]);

  useEffect(() => { invalidate(); }, [uniforms, invalidate]);
  useFrame((_, delta) => {
    if (!visible) return;
    stepParticles(positions, base, pointer.current, delta);
    elapsed.current = advanceSailClock(material.current, elapsed.current, delta);
    if (attribute.current) attribute.current.needsUpdate = true;
  });

  return (
    <points position={[0, -0.35, 0]} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={attribute} attach="attributes-position" args={[positions, 3]} usage={DynamicDrawUsage} />
        <bufferAttribute attach="attributes-sailWeight" args={[wave.weights, 1]} />
        <bufferAttribute attach="attributes-sailPhase" args={[wave.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} transparent depthWrite={false} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </points>
  );
}

export default function ParticleSailboatScene({ color, visible, fallback, onContextLost }: {
  color: string;
  visible: boolean;
  fallback: ReactNode;
  onContextLost: () => void;
}) {
  return (
    <Canvas orthographic camera={{ position: [0, 0, 10], near: 0.1, far: 20 }} dpr={[1, 1.5]} frameloop={visible ? "always" : "never"} gl={{ alpha: true, antialias: false, powerPreference: "low-power" }} fallback={fallback}>
      <Boat color={color} visible={visible} onContextLost={onContextLost} />
    </Canvas>
  );
}
