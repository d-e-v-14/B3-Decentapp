"use client";

import ChannelList from "./ChannelList";

export default function Sidebar() {
  return (
    <aside className="w-[280px] border-r border-white/10 bg-[#101528] flex flex-col">
      <div className="px-4 py-4 border-b border-white/10">
        <h1 className="text-lg font-semibold">B3 DecentApp</h1>
        <p className="text-xs text-gray-400">Secure messaging</p>
      </div>

      <ChannelList />
    </aside>
  );
}
