"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * ライト/ダーク切替トグル。アイコンは CSS の dark: バリアントで出し分けるため
 * mounted 判定が不要で、ハイドレーション差異も起きない。
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label="テーマを切り替え"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" aria-hidden />
      <MoonIcon className="block dark:hidden" aria-hidden />
    </Button>
  );
}
