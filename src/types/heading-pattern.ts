export interface HeadingPattern {
  id: string;
  label: string;
  pattern: string;
  level: 1 | 2 | 3;
  enabled: boolean;
  builtin: boolean;
}

export interface ExtractionProgress {
  currentPage: number;
  totalPages: number;
  foundCount: number;
}
