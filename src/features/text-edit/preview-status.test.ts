import { describe, it, expect } from "vitest";
import { previewStatus } from "./preview-status";

describe("previewStatus（編集ボックスに出す状態）", () => {
  it("入力が元の文字列と同じなら、確定できない（変更なし）", () => {
    expect(
      previewStatus({ original: "81.9", text: "81.9", result: null }),
    ).toEqual({ kind: "unchanged", message: null, canConfirm: false });
  });

  it("確認中（結果がまだ無い）は確定できない", () => {
    expect(
      previewStatus({ original: "81.9", text: "90", result: null }),
    ).toEqual({ kind: "checking", message: null, canConfirm: false });
  });

  it("元の書体のまま書き換えられるなら、メッセージなしで確定できる", () => {
    expect(
      previewStatus({
        original: "81.9",
        text: "90",
        result: { ok: true, clipAdjustments: 1, warnings: [] },
      }),
    ).toEqual({ kind: "ok", message: null, canConfirm: true });
  });

  it("同梱フォントで描く文字があれば、書体が変わる旨を表示したうえで確定できる", () => {
    expect(
      previewStatus({
        original: "81.9",
        text: "1,234",
        result: {
          ok: true,
          clipAdjustments: 0,
          warnings: [
            {
              kind: "fallback-font",
              replacement: 0,
              chars: [",", "鷗"],
              style: "sans",
            },
          ],
        },
      }),
    ).toEqual({
      kind: "warning",
      message:
        "「,」「鷗」は元の書体に無いため、ゴシック体（Noto Sans JP）で描きます",
      canConfirm: true,
    });
  });

  it("明朝体の同梱フォントで描く文字は、明朝体で描く旨を表示する（書体ごとに分けて表示）", () => {
    const status = previewStatus({
      original: "81.9",
      text: "1,234",
      result: {
        ok: true,
        clipAdjustments: 0,
        warnings: [
          {
            kind: "fallback-font",
            replacement: 0,
            chars: [","],
            style: "serif",
          },
          {
            kind: "fallback-font",
            replacement: 1,
            chars: ["鷗"],
            style: "sans",
          },
          {
            kind: "fallback-font",
            replacement: 2,
            chars: [",", "髙"],
            style: "serif",
          },
        ],
      },
    });
    expect(status).toEqual({
      kind: "warning",
      message:
        "「,」「髙」は元の書体に無いため、明朝体（Noto Serif JP）で描きます。「鷗」は元の書体に無いため、ゴシック体（Noto Sans JP）で描きます",
      canConfirm: true,
    });
  });

  it("はみ出しを直せないクリップがあれば、その旨も表示する（確定はできる）", () => {
    const status = previewStatus({
      original: "a",
      text: "abc",
      result: {
        ok: true,
        clipAdjustments: 0,
        warnings: [{ kind: "clip-not-adjusted", replacement: 0 }],
      },
    });
    expect(status.kind).toBe("warning");
    expect(status.canConfirm).toBe(true);
    expect(status.message).toContain("一部が表示されない");
  });

  it("書き換えられない場合は理由を表示し、確定できない", () => {
    expect(
      previewStatus({
        original: "81.9",
        text: "漢",
        result: {
          ok: false,
          failures: [
            {
              kind: "missing-glyphs",
              replacement: 0,
              chars: ["漢"],
              style: "serif",
            },
          ],
        },
      }),
    ).toEqual({
      kind: "error",
      message: "「漢」を描けるフォントがありません",
      canConfirm: false,
    });
  });

  it("空文字（削除）も書き換えとして確定できる", () => {
    expect(
      previewStatus({
        original: "81.9",
        text: "",
        result: { ok: true, clipAdjustments: 0, warnings: [] },
      }).canConfirm,
    ).toBe(true);
  });
});
