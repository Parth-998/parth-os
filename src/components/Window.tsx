"use client";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { startMove, startResize } from "@/lib/tiling";

const EDGES = ["n", "s", "e", "w", "se"] as const;

/**
 * A tiled window, like a Hyprland rice:
 *   drag the title bar to move it (snaps to a grid and stays put) · drag an edge or the corner to resize.
 */
export default function Window({
  path,
  right,
  index = 0,
  className = "",
  style,
  flexible = false,
  children,
}: {
  /** Content fills any height (terminal, chart): the tiler only needs a small minimum. */
  flexible?: boolean;
  path: string;
  right?: ReactNode;
  /** Launch order within its workspace. */
  index?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      ref={ref}
      className={`win ${className}`}
      data-flex={flexible ? "1" : undefined}
      style={{ ...style, ["--i" as string]: index }}
      onTransitionEnd={(e) => {
        if (e.propertyName === "transform") e.currentTarget.classList.add("settled");
      }}
    >
      <div
        className="win-path win-drag"
        title="drag to move"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("a, button") || !ref.current) return;
          e.preventDefault();
          startMove(ref.current, e.nativeEvent);
        }}
      >
        <span>{path}</span>
        {right && <span>{right}</span>}
      </div>
      {children}
      {EDGES.map((edge) => (
        <span
          key={edge}
          className={`win-edge ${edge}`}
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0 || !ref.current) return;
            e.preventDefault();
            e.stopPropagation();
            startResize(ref.current, edge, e.nativeEvent);
          }}
        />
      ))}
    </section>
  );
}
