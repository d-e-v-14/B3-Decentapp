"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "b3-settings";

type Settings = {
  theme: "dark" | "system";
  notifications: boolean;
  readReceipts: boolean;
};

const defaultSettings: Settings = {
  theme: "dark",
  notifications: true,
  readReceipts: true,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSettings(JSON.parse(stored));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, ready]);

  const update = (partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return { settings, update, ready };
}
