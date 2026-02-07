"use client";

import { Message } from "@/hooks/useChat";

export default function MessageBubble({ message }: { message: Message }) {
  const isMe = message.sender === "me";

  return (
    <div
      className={`flex ${
        isMe ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[60%] rounded-2xl px-4 py-2 text-sm ${
          isMe
            ? "bg-indigo-500 text-white"
            : "bg-white/10 text-gray-200"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
