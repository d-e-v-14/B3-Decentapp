"use client";

import { useIdentity } from "../../hooks/useIdentity";

export default function TopBar({ chat }: { chat: any }) {
  const identity = useIdentity();

  return (
    <div className="h-16 border-b border-white/10 px-6 flex items-center justify-between">
      <div>
        <div className="font-semibold">
          {chat.activeChat?.name || "Select a channel"}
        </div>
        <div className="text-xs text-gray-400">
          End-to-end encrypted
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-xs text-gray-400">
          {identity.short}
        </div>
        <div className="h-8 w-8 rounded-full bg-indigo-600 from-indigo-500 to-purple-600" />
      </div>
    </div>
  );
}
