"use client";

import { useEffect, useState } from "react";

export type Message = {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: number;
};

const STORAGE_KEY = "b3-chat";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setMessages(JSON.parse(stored));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages, ready]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    const msg: Message = {
      id: crypto.randomUUID(),
      text,
      sender: "me",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, msg]);

    // Fake reply (for demo polish)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: "Got it 👍",
          sender: "other",
          timestamp: Date.now(),
        },
      ]);
    }, 800);
  };

  return { messages, sendMessage };
}
