import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Profile } from "@/lib/types";
import { type PlaylistItem } from "@/lib/m3u-parser";

export type TabType = "live" | "movies" | "series" | "favorites";

interface IptvState {
  selectedProfile: Profile | null;
  setSelectedProfile: (profile: Profile | null) => void;

  currentTab: TabType;
  setCurrentTab: (tab: TabType) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

  playingItem: PlaylistItem | null;
  setPlayingItem: (item: PlaylistItem | null) => void;

  directMode: boolean;
  setDirectMode: (v: boolean) => void;
}

export const useIptvStore = create<IptvState>()(
  persist(
    (set) => ({
      selectedProfile: null,
      setSelectedProfile: (profile) => set({ selectedProfile: profile }),

      currentTab: "live",
      setCurrentTab: (tab) => set({ currentTab: tab }),

      searchQuery: "",
      setSearchQuery: (query) => set({ searchQuery: query }),

      playingItem: null,
      setPlayingItem: (item) => set({ playingItem: item }),

      directMode: false,
      setDirectMode: (v) => set({ directMode: v }),
    }),
    {
      name: "iptv-storage",
      partialize: (state) => ({
        selectedProfile: state.selectedProfile,
        currentTab: state.currentTab,
        directMode: state.directMode,
      }),
    }
  )
);
