import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { sampleSailboat } from "./particleSimulation";

const Scene = lazy(() => import("./ParticleSailboatScene"));
const silhouette = sampleSailboat();

function StaticBoat() {
  return (
    <svg className="particle-sailboat-static" viewBox="-3.2 -2 6.4 4" aria-hidden="true">
      <g fill="currentColor" transform="scale(1 -1) translate(0 -.35)">
        {Array.from({ length: silhouette.length / 3 }, (_, index) => (
          <circle key={index} cx={silhouette[index * 3]} cy={silhouette[index * 3 + 1]} r=".010" opacity=".7" />
        ))}
      </g>
    </svg>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StaticBoat /> : this.props.children; }
}

export function ParticleSailboat() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [color, setColor] = useState("");
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReduced(media.matches);
    const onVisibility = () => setVisible(!document.hidden);
    const onTheme = () => setColor(getComputedStyle(document.documentElement).getPropertyValue("--muted-foreground").trim());
    const observer = new MutationObserver(onTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    onTheme();
    media.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <div className="particle-sailboat" aria-hidden="true">
      {reduced || contextLost || !color ? <StaticBoat /> : (
        <SceneBoundary>
          <Suspense fallback={<StaticBoat />}>
            <Scene color={color} visible={visible} fallback={<StaticBoat />} onContextLost={() => setContextLost(true)} />
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}
