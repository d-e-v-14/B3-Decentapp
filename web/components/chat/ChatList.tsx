export default function ChatList({ chat }: any) {
  return (
    <div className="space-y-1 px-2">
      {chat.chats.map((c: any) => {
        const active = c.id === chat.activeChatId;

        return (
          <div
            key={c.id}
            onClick={() => chat.setActiveChatId(c.id)}
            className={`cursor-pointer rounded-md px-3 py-2 border transition ${
              active
                ? "border-blue-500/40 bg-[#111827]"
                : "border-transparent hover:border-gray-700 hover:bg-gray-900"
            }`}
          >
            <div className="text-sm font-medium tracking-wide">
              {c.name}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {c.lastMessage}
            </div>
          </div>
        );
      })}
    </div>
  );
}