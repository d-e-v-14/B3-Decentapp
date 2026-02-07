"use client";

import { useState } from "react";
import SettingsSidebar from "./SettingsSidebar";
import GeneralSettings from "./GeneralSettings";
import AppearanceSettings from "./AppearanceSettings";
import NotificationSettings from "./NotificationSettings";
import PrivacySettings from "./PrivacySettings";

export default function SettingsLayout() {
  const [tab, setTab] = useState("general");

  const renderTab = () => {
    switch (tab) {
      case "appearance":
        return <AppearanceSettings />;
      case "notifications":
        return <NotificationSettings />;
      case "privacy":
        return <PrivacySettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <div className="flex h-full">
      <SettingsSidebar onSelect={setTab} />

      <div className="flex-1 p-8 overflow-y-auto bg-[#0f1424]">
        {renderTab()}
      </div>
    </div>
  );
}
