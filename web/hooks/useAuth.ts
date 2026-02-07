"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useAuthStore } from "@/store/authStore";

const AUTH_MESSAGE = "Sign in to B3 DecentApp";

export function useAuth() {
  const wallet = useWallet();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  const signIn = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    if (!wallet.signMessage) {
      throw new Error("Wallet does not support message signing");
    }

    const message = new TextEncoder().encode(AUTH_MESSAGE);
    const signature = await wallet.signMessage(message);

    login(wallet.publicKey.toBase58(), signature);
  };

  return {
    signIn,
    logout,
  };
}
