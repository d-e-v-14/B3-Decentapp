export default function ChatInfo({ chat }: any) {
  return (
    <aside className="w-[300px] bg-[#141a2b] p-5 border-l border-white/10">
      <div className="flex flex-col items-center">
        <div className="h-20 w-20 rounded-full bg-indigo-500 flex items-center justify-center text-2xl font-bold">
          {chat.activeChat?.name[0]}
        </div>
        <div className="mt-3 font-semibold">
          {chat.activeChat?.name}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Secure channel
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="p-3 rounded-xl bg-[#1b2136] text-sm">
          🔐 Encrypted
        </div>
        <div className="p-3 rounded-xl bg-[#1b2136] text-sm">
          👥 Members: 3
        </div>
        <div className="p-3 rounded-xl bg-[#1b2136] text-sm">
          📁 Shared files
        </div>
      </div>
    </aside>
  );
}
