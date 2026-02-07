"use client";

import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";

export default function ChatLayout() {
  return (
    <div className="flex h-full w-full">
      <Sidebar />
      <ChatWindow />
    </div>
  );
}
