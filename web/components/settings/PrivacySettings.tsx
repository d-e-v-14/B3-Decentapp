"use client";

import { useSettings } from "../../hooks/useSettings";

export default function PrivacySettings() {
  const { settings, update, ready } = useSettings();
  if (!ready) return null;

  return (
    <section>
      <h3 className="text-lg font-semibold mb-4">
        Privacy & Security
      </h3>

      <label className="flex items-center justify-between">
        <span className="text-sm text-gray-300">
          Send read receipts
        </span>
        <input
          type="checkbox"
          checked={settings.readReceipts}
          onChange={(e) =>
            update({ readReceipts: e.target.checked })
          }
        />
      </label>

      <p className="mt-4 text-xs text-gray-500">
        Messages are end-to-end encrypted. Keys are never stored
        on centralized servers.
      </p>
    </section>
  );
}
