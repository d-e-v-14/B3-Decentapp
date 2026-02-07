"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function ConnectWalletButton() {
  return (
    <div className="flex justify-center">
      <WalletMultiButton />
    </div>
  );
}
