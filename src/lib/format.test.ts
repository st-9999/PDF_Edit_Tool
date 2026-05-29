import { describe, it, expect } from "vitest";
import { formatFileSize } from "./format";

describe("formatFileSize", () => {
  it("0 と B 単位は整数表記", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("KB / MB は小数第1位まで", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(13002342)).toBe("12.4 MB");
  });

  it("GB 境界", () => {
    expect(formatFileSize(1024 ** 3)).toBe("1.0 GB");
  });

  it("不正値は — を返す", () => {
    expect(formatFileSize(-1)).toBe("—");
    expect(formatFileSize(Number.NaN)).toBe("—");
  });
});
