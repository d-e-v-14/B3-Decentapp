"use client";

import AppShell from "@/components/layout/AppShell";
import ProfileLayout from "@/components/profile/ProfileLayout";
import ProfileCard from "@/components/profile/ProfileCard";
import WalletSection from "@/components/profile/WalletSection";
import DangerZone from "@/components/profile/DangerZone";

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileLayout>
        <ProfileCard />
        <WalletSection />
        <DangerZone />
      </ProfileLayout>
    </AppShell>
  );
}
