import { create } from "zustand";

type AuthState = {
  isAuthenticated: boolean;
  publicKey: string | null;
  signature: Uint8Array | null;

  login: (publicKey: string, signature: Uint8Array) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  publicKey: null,
  signature: null,

  login: (publicKey, signature) =>
    set({
      isAuthenticated: true,
      publicKey,
      signature,
    }),

  logout: () =>
    set({
      isAuthenticated: false,
      publicKey: null,
      signature: null,
    }),
}));
