"use client";

const channels = [
  { id: "general", name: "general" },
  { id: "team", name: "hackathon-team" },
];

export default function ChannelList() {
  return (
    <div className="flex-1 px-3 py-4 space-y-1">
      <p className="text-xs text-gray-400 mb-2 uppercase">
        Channels
      </p>

      {channels.map((c) => (
        <button
          key={c.id}
          className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10"
        >
          #{c.name}
        </button>
      ))}
    </div>
  );
}
