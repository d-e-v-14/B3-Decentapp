"use client";

import { useSettings } from "../../hooks/useSettings";

export default function AppearanceSettings() {
  const { settings, update, ready } = useSettings();
  if (!ready) return null;

  return (
    <section>
      <h3 className="text-lg font-semibold mb-4">
        Appearance
      </h3>

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="radio"
            checked={settings.theme === "dark"}
            onChange={() => update({ theme: "dark" })}
          />
          <span className="text-sm text-gray-300">
            Dark theme
          </span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="radio"
            checked={settings.theme === "system"}
            onChange={() => update({ theme: "system" })}
          />
          <span className="text-sm text-gray-300">
            System default
          </span>
        </label>
      </div>
    </section>
  );
}
