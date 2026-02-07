"use client";

import { useState } from "react";

const tabs = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy & Security" },
];

export default function SettingsSidebar({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const [active, setActive] = useState("general");

  return (
    <aside className="w-[260px] border-r border-white/10 bg-[#141a2b] p-4">
      <h2 className="mb-4 text-sm font-semibold text-gray-300">
        Settings
      </h2>

      <div className="space-y-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActive(tab.id);
              onSelect(tab.id);
            }}
            className={`w-full text-left px-4 py-2 rounded-lg text-sm ${
              active === tab.id
                ? "bg-indigo-500/20 text-white"
                : "text-gray-300 hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
