"use client";

import { useSettings } from "../../hooks/useSettings";

export default function GeneralSettings() {
  const { settings, update, ready } = useSettings();
  if (!ready) return null;

  return (
    <section>
      <h3 className="text-lg font-semibold mb-4">
        General
      </h3>

      <div className="space-y-4">
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-300">
            Enable notifications
          </span>
          <input
            type="checkbox"
            checked={settings.notifications}
            onChange={(e) =>
              update({ notifications: e.target.checked })
            }
          />
        </label>
      </div>
    </section>
  );
}
