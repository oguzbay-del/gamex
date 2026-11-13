import { emptyRecords, LEVELS } from "@/game/levels";
import type { Save } from "@/game/types";

const KEY = "zirve-kosusu-v1";

export function freshSave(): Save {
  return { version: 1, unlocked: 0, mute: false, levels: emptyRecords() };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed.version !== 1 || !Array.isArray(parsed.levels)) return freshSave();
    const levels = emptyRecords();
    for (let i = 0; i < LEVELS.length; i++) {
      const row = parsed.levels[i];
      if (!row) continue;
      levels[i] = {
        bestCoins: typeof row.bestCoins === "number" ? row.bestCoins : 0,
        bestTime: typeof row.bestTime === "number" ? row.bestTime : null,
        cleared: Boolean(row.cleared),
      };
    }
    return {
      version: 1,
      unlocked: Math.max(0, Math.min(LEVELS.length - 1, parsed.unlocked ?? 0)),
      mute: Boolean(parsed.mute),
      levels,
    };
  } catch {
    return freshSave();
  }
}

export function writeSave(save: Save) {
  localStorage.setItem(KEY, JSON.stringify(save));
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const t = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${t}`;
}
