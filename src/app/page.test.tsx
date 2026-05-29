import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home (P0 空アプリ)", () => {
  it("アプリ名の見出しを表示する", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "PDF ビューア＆エディタ" }),
    ).toBeInTheDocument();
  });

  it("PDF読み込み用のドロップゾーン領域を表示する", () => {
    render(<Home />);
    expect(
      screen.getByRole("region", { name: "PDFの読み込み" }),
    ).toBeInTheDocument();
  });

  it("ブラウザ内完結（プライバシー）の説明文を表示する", () => {
    render(<Home />);
    expect(
      screen.getByText(/ファイルはサーバーに送信されません/),
    ).toBeInTheDocument();
  });
});
