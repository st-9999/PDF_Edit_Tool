import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./empty-state";
import { useViewerStore } from "@/store/viewer-store";

beforeEach(() => {
  useViewerStore.getState().clearFile();
});

const SINGLE_ZONE = "PDFの読み込み";
const MERGE_ZONE = "結合する複数 PDF の読み込み";

function singleInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"]:not([multiple])',
  );
  if (!input) throw new Error("単一読み込みの file input が見つかりません");
  return input;
}

function mergeInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"][multiple]',
  );
  if (!input) throw new Error("結合用の file input が見つかりません");
  return input;
}

function makePdf(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: "application/pdf",
  });
}

/** 結合モードへ切り替わった（＝入口の 2 枠が消えた）か。 */
function expectMergeMode() {
  expect(
    screen.queryByRole("button", { name: SINGLE_ZONE }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: MERGE_ZONE }),
  ).not.toBeInTheDocument();
}

describe("EmptyState", () => {
  it("ドロップゾーンとプライバシー説明を表示する", () => {
    render(<EmptyState />);
    expect(
      screen.getByRole("button", { name: SINGLE_ZONE }),
    ).toBeInTheDocument();
    expect(screen.getByText(/サーバーに送信されません/)).toBeInTheDocument();
  });

  it("PDF を選択するとストアに file が設定される", () => {
    render(<EmptyState />);
    fireEvent.change(singleInput(), {
      target: { files: [makePdf("doc.pdf")] },
    });

    const state = useViewerStore.getState();
    expect(state.file?.name).toBe("doc.pdf");
    expect(state.status).toBe("loading");
  });

  it("拡張子のみ .pdf でも受け付ける", () => {
    render(<EmptyState />);
    const pdf = new File([new Uint8Array([1])], "nomime.PDF", { type: "" });
    fireEvent.change(singleInput(), { target: { files: [pdf] } });
    expect(useViewerStore.getState().file?.name).toBe("nomime.PDF");
  });

  it("PDF 以外は拒否し file を設定しない", () => {
    render(<EmptyState />);
    const txt = new File(["hello"], "note.txt", { type: "text/plain" });
    fireEvent.change(singleInput(), { target: { files: [txt] } });
    expect(useViewerStore.getState().file).toBeNull();
  });

  it("単一読み込みの枠へドロップすると、その PDF を開く", () => {
    render(<EmptyState />);
    fireEvent.drop(screen.getByRole("button", { name: SINGLE_ZONE }), {
      dataTransfer: { files: [makePdf("dropped.pdf")] },
    });
    expect(useViewerStore.getState().file?.name).toBe("dropped.pdf");
  });

  describe("複数 PDF 結合の枠", () => {
    it("単一読み込みの枠と並んで、独立した結合用の枠を表示する", () => {
      render(<EmptyState />);
      const single = screen.getByRole("button", { name: SINGLE_ZONE });
      const merge = screen.getByRole("button", { name: MERGE_ZONE });
      // 別々の枠であり、互いに入れ子ではない
      expect(single.contains(merge)).toBe(false);
      expect(merge.contains(single)).toBe(false);
      // 枠内に結合の案内がある
      expect(merge).toHaveTextContent("複数 PDF を結合");
      expect(merge).toHaveTextContent("ドラッグ & ドロップ");
    });

    it("結合用の入力は複数選択でき、単一読み込みの入力は複数選択できない", () => {
      render(<EmptyState />);
      expect(mergeInput().multiple).toBe(true);
      expect(singleInput().multiple).toBe(false);
    });

    it("結合用の枠へ複数 PDF をドロップすると結合モードへ進み、単一読み込みはしない", () => {
      render(<EmptyState />);
      fireEvent.drop(screen.getByRole("button", { name: MERGE_ZONE }), {
        dataTransfer: { files: [makePdf("a.pdf"), makePdf("b.pdf")] },
      });
      expectMergeMode();
      expect(useViewerStore.getState().file).toBeNull();
    });

    it("結合用の入力で複数 PDF を選ぶと結合モードへ進む", () => {
      render(<EmptyState />);
      fireEvent.change(mergeInput(), {
        target: { files: [makePdf("a.pdf"), makePdf("b.pdf")] },
      });
      expectMergeMode();
      expect(useViewerStore.getState().file).toBeNull();
    });

    it("結合用の枠へ PDF 以外だけをドロップしても結合モードへ進まない", () => {
      render(<EmptyState />);
      const txt = new File(["hello"], "note.txt", { type: "text/plain" });
      fireEvent.drop(screen.getByRole("button", { name: MERGE_ZONE }), {
        dataTransfer: { files: [txt] },
      });
      expect(
        screen.getByRole("button", { name: MERGE_ZONE }),
      ).toBeInTheDocument();
      expect(useViewerStore.getState().file).toBeNull();
    });

    it("結合用の枠へ何もドロップされなければ結合モードへ進まない", () => {
      render(<EmptyState />);
      fireEvent.drop(screen.getByRole("button", { name: MERGE_ZONE }), {
        dataTransfer: { files: [] },
      });
      expect(
        screen.getByRole("button", { name: MERGE_ZONE }),
      ).toBeInTheDocument();
    });
  });
});
