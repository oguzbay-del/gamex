export type Rect = { x: number; y: number; w: number; h: number };

export type MoverDef = Rect & {
  axis: "x" | "y";
  amp: number;
  period: number;
  phase?: number;
};

export type CoinDef = { x: number; y: number };
export type Mark = { x: number; y: number };
export type Hint = { x: number; y: number; text: string };

export type Level = {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  /** Feet position on a surface. */
  spawn: Mark;
  solids: Rect[];
  oneways: Rect[];
  movers: MoverDef[];
  coins: CoinDef[];
  spikes: Rect[];
  /** Surface y the player stands on. */
  checkpoints: Mark[];
  flag: Mark;
  hints: Hint[];
};

export type Screen = "select" | "play" | "pause" | "win";

export type LevelRecord = {
  bestCoins: number;
  bestTime: number | null;
  cleared: boolean;
};

export type Save = {
  version: 1;
  unlocked: number;
  mute: boolean;
  levels: LevelRecord[];
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
  text?: string;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getX: () => number;
  getY: () => number;
  getFacing: () => number;
  getCoins: () => number;
  setKeys: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
