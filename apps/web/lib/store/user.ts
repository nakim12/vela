"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Pre-Clerk identity stub. We hold the active `user_id` in localStorage so
 * navigating between pages (and refreshing the tab) preserves which lifter
 * we're acting as. Two hard-coded demo personas + a "custom" option that
 * lets the user paste in any id (useful for testing fresh onboarding).
 *
 * Replace this whole file with a Clerk-backed `useUser()` once auth lands —
 * components just need `userId` to keep working.
 */

export const DEMO_USERS = [
  {
    id: "demo-user-1",
    label: "Demo · Persona A (long femurs, knee cave history)",
  },
  {
    id: "demo-user-2",
    label: "Demo · Persona B (cleared by PT, short femurs)",
  },
] as const;

type UserState = {
  userId: string;
  setUserId: (id: string) => void;
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: DEMO_USERS[0].id,
      setUserId: (id) => set({ userId: id.trim() || DEMO_USERS[0].id }),
    }),
    { name: "vela.userId" },
  ),
);
