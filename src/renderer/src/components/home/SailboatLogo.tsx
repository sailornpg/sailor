import type { CSSProperties } from "react";
import { sampleSailboat } from "./particleSimulation";

const points = sampleSailboat();

export function SailboatLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      style={{ color: "var(--muted-foreground)", flex: "none" } as CSSProperties}
      viewBox="-3.2 -2 6.4 4"
      width={size}
    >
      <g fill="currentColor" transform="scale(1 -1) translate(0 -.35)">
        {Array.from({ length: points.length / 3 }, (_, index) => (
          <circle key={index} cx={points[index * 3]} cy={points[index * 3 + 1]} r=".018" />
        ))}
      </g>
    </svg>
  );
}
