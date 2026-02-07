"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "b3-profile";

type Profile = {
  name: string;
  username: string;
};

const defaultProfile: Profile = {
  name: "Anonymous",
  username: "guest",
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setProfile(JSON.parse(stored));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  }, [profile, ready]);

  const update = (data: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...data }));
  };

  return { profile, update, ready };
}
