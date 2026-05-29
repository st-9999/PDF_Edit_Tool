export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          PDF ビューア＆エディタ
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          すべての処理をブラウザ内で完結。ファイルはサーバーに送信されません。
        </p>
      </header>

      {/* P0: 初期（未読込）状態のドロップゾーン枠。実機能は P1 以降で実装。 */}
      <section
        aria-label="PDFの読み込み"
        className="flex w-full max-w-xl flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 p-16 text-center dark:border-zinc-700"
      >
        <p className="text-lg font-medium">PDF をドラッグ &amp; ドロップ</p>
        <p className="text-muted-foreground text-sm">
          またはクリックしてファイルを選択（P1 で実装予定）
        </p>
      </section>
    </main>
  );
}
