"use client";

import { useEffect, useState } from "react";

function generateAddress() {
  const chars = "abcdef0123456789";
  let addr = "B3";
  for (let i = 0; i < 38; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

export function useIdentity() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    let stored = localStorage.getItem("b3-identity");

    if (!stored) {
      stored = generateAddress();
      localStorage.setItem("b3-identity", stored);
    }

    setAddress(stored);
  }, []);

  if (!address) {
    return {
      address: "",
      short: "",
      connected: false,
      ready: false,
    };
  }

  return {
    address,
    short: `${address.slice(0, 4)}…${address.slice(-4)}`,
    connected: true,
    ready: true,
  };
}
