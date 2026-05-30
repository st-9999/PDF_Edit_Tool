import { create } from "zustand";
import type { SearchMatch } from "@/lib/search/search";

interface SearchState {
  open: boolean;
  query: string;
  /** クエリを正規表現として解釈する。 */
  regex: boolean;
  /** 大文字小文字を区別する。 */
  caseSensitive: boolean;
  matches: SearchMatch[];
  /** matches 内の現在位置。ヒット無しは -1。 */
  activeIndex: number;

  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  setRegex: (regex: boolean) => void;
  setCaseSensitive: (caseSensitive: boolean) => void;
  setResults: (matches: SearchMatch[]) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  open: false,
  query: "",
  regex: false,
  caseSensitive: false,
  matches: [],
  activeIndex: -1,

  setOpen: (open) => set({ open }),
  setQuery: (query) => set({ query }),
  setRegex: (regex) => set({ regex }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
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

  reset: () =>
    set({
      open: false,
      query: "",
      regex: false,
      caseSensitive: false,
      matches: [],
      activeIndex: -1,
    }),
}));
