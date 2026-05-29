import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./empty-state";
import { useViewerStore } from "@/store/viewer-store";

beforeEach(() => {
  useViewerStore.getState().clearFile();
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input が見つかりません");
  return input;
}

describe("EmptyState", () => {
  it("ドロップゾーンとプライバシー説明を表示する", () => {
    render(<EmptyState />);
    expect(
      screen.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/サーバーに送信されません/)).toBeInTheDocument();
  });

  it("PDF を選択するとストアに file が設定される", () => {
    render(<EmptyState />);
    const pdf = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
      "doc.pdf",
      {
        type: "application/pdf",
      },
    );
    fireEvent.change(fileInput(), { target: { files: [pdf] } });

    const state = useViewerStore.getState();
    expect(state.file?.name).toBe("doc.pdf");
    expect(state.status).toBe("loading");
  });

  it("拡張子のみ .pdf でも受け付ける", () => {
    render(<EmptyState />);
    const pdf = new File([new Uint8Array([1])], "nomime.PDF", { type: "" });
    fireEvent.change(fileInput(), { target: { files: [pdf] } });
    expect(useViewerStore.getState().file?.name).toBe("nomime.PDF");
  });

  it("PDF 以外は拒否し file を設定しない", () => {
    render(<EmptyState />);
    const txt = new File(["hello"], "note.txt", { type: "text/plain" });
    fireEvent.change(fileInput(), { target: { files: [txt] } });
    expect(useViewerStore.getState().file).toBeNull();
  });
});
