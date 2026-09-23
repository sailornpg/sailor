import {
  Component,
  lazy,
  Suspense,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { sampleSailboat } from "../../home/particleSimulation";
import { createParticleGrid } from "../../home/particleGrid";
import type { EntryState } from "./chatEntryTransition";

const Scene = lazy(() => import("./ChatParticleScene"));
const boat = sampleSailboat();
export type BoatAnchor = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type ParticleBackdropProps = {
  phase: EntryState["phase"];
  anchor: BoatAnchor | null;
  host: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  color: string;
  visible: boolean;
  reduced: boolean;
};

function StaticBackdrop({
  phase,
  anchor,
  width,
  height,
}: ParticleBackdropProps) {
  return (
    <svg width="100%" height="100%" aria-hidden="true">
      {phase === "welcome" && anchor ? (
        <g
          transform={`translate(${anchor.left + anchor.width / 2} ${anchor.top + anchor.height / 2}) scale(${anchor.width / 6.4} ${-anchor.width / 6.4})`}
        >
          {Array.from({ length: boat.length / 3 }, (_, i) => (
            <circle
              key={i}
              cx={boat[i * 3]}
              cy={boat[i * 3 + 1] - 0.35}
              r=".01"
              fill="currentColor"
              opacity=".7"
            />
          ))}
        </g>
      ) : (
        createParticleGrid(width, height).map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="0.8"
            fill="currentColor"
            opacity=".44"
          />
        ))
      )}
    </svg>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ChatParticleBackdrop(props: ParticleBackdropProps) {
  const [lost, setLost] = useState(false);
  const fallback = <StaticBackdrop {...props} />;
  return (
    <div className="chat-particle-backdrop" aria-hidden="true">
      {props.reduced || lost || !props.color ? (
        fallback
      ) : (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <Scene
              {...props}
              fallback={fallback}
              onLost={() => setLost(true)}
            />
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}
