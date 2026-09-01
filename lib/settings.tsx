"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Lang } from "./copy";
import type { Difficulty } from "./engine/types";
import { readLocal } from "./localKeys";

export type Speed = "chill" | "normal" | "fast";

export interface Settings {
  sound: boolean;
  animations: boolean;
  lang: Lang;
  speed: Speed;
  difficulty: Difficulty;
}

const DEFAULTS: Settings = {
  sound: true,
  animations: true,
  lang: "en",
  speed: "normal",
  difficulty: "medium",
};

const KEY = "thulla.settings.v1";

/** Multiplier applied to every scripted pause, so "game speed" is one knob. */
export const SPEED_FACTOR: Record<Speed, number> = {
  chill: 1.45,
  normal: 1,
  fast: 0.55,
};

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  ready: boolean;
}

const SettingsContext = createContext<Ctx>({
  settings: DEFAULTS,
  update: () => {},
  ready: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  // Hydration guard: the server can't know what's in localStorage, so we
  // render defaults first and only then swap in the stored values.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = readLocal(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration: the server can't see localStorage, so defaults render first
      if (raw) setSettings({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) });
    } catch {
      /* private mode, cleared storage, corrupt JSON — defaults are fine */
    }
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* not worth surfacing — the setting still applies for this session */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.motion = settings.animations ? "on" : "off";
  }, [settings.animations, ready]);

  const value = useMemo(() => ({ settings, update, ready }), [settings, update, ready]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
