import { OceanEngine, type EngineOptions, type Motion } from "./engine";
import type { Palette } from "./renderer";
import { GridEngine } from "./scenes";
import { Rain } from "./rain";
import { Waves } from "./waves";
import { Apartment } from "./apartment";

export type BackgroundId = "sharks" | "rain" | "waves" | "apartment";

export interface BackgroundInfo {
  id: BackgroundId;
  name: string;
  how: string;
}

export const BACKGROUNDS: BackgroundInfo[] = [
  { id: "sharks", name: "sharks", how: "move scatters fish · click drops food · drag leads the sharks" },
  { id: "rain", name: "rain", how: "click to walk him there · click the sky for lightning · click the lamp to switch it · swipe back and forth to build up wind" },
  { id: "waves", name: "waves", how: "click splashes · drag leaves a wake" },
  { id: "apartment", name: "chicago", how: "real chicago time · drag right to fast-forward, left to rewind · click for now" },
];

export interface Background {
  setPalette(p: Palette, contrast?: number): void;
  setMotion(m: Motion): void;
  setInteraction(v: number): void;
  destroy(): void;
}

export function createBackground(id: BackgroundId, canvas: HTMLCanvasElement, opts: EngineOptions = {}): Background {
  switch (id) {
    case "rain":
      return new GridEngine(canvas, new Rain(), opts);
    case "waves":
      return new GridEngine(canvas, new Waves(), opts);
    case "apartment":
      return new GridEngine(canvas, new Apartment(), opts);
    default:
      return new OceanEngine(canvas, opts);
  }
}
