"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ComponentProps } from "react";

/** next-themes の ThemeProvider をクライアント境界として再エクスポート。 */
export function ThemeProvider(props: ComponentProps<typeof NextThemeProvider>) {
  return <NextThemeProvider {...props} />;
}
