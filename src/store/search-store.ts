import { create } from "zustand";
import type { SearchMatch } from "@/lib/search/search";

interface SearchState {
  open: boolean;
  query: string;
  matches: SearchMatch[];
  /** matches 内の現在位置。ヒット無しは -1。 */
  activeIndex: number;

  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  setResults: (matches: SearchMatch[]) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  open: false,
  query: "",
  matches: [],
  activeIndex: -1,

  setOpen: (open) => set({ open }),
  setQuery: (query) => set({ query }),
  setResults: (matches) =>
    set({ matches, activeIndex: matches.length > 0 ? 0 : -1 }),

  next: () =>
    set((s) =>
      s.matches.length === 0
        ? s
        : { activeIndex: (s.activeIndex + 1) % s.matches.length },
    ),
  prev: () =>
    set((s) =>
      s.matches.length === 0
        ? s
        : {
            activeIndex:
              (s.activeIndex - 1 + s.matches.length) % s.matches.length,
          },
    ),

  reset: () => set({ open: false, query: "", matches: [], activeIndex: -1 }),
}));
