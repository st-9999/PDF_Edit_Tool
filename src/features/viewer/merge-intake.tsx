"use client";

import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilePlus2Icon,
  GripVerticalIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useViewerStore } from "@/store/viewer-store";
import { loadPdfDocument } from "@/lib/pdf/pdfjs";
import { createId } from "@/lib/id";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

type LoadState = "loading" | "ready" | "error";

interface MergeItem {
  id: string;
  file: File;
  numPages: number | null;
  state: LoadState;
}

/** 並べ替え可能な 1 行。ドラッグハンドル＋上下ボタンで順序を変更できる。 */
function SortableRow({
  item,
  position,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: MergeItem;
  position: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="bg-card flex items-center gap-2 rounded-md border px-2 py-1.5"
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`${position} 番目を並び替え`}
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>

      <span className="text-muted-foreground w-6 shrink-0 text-center text-sm tabular-nums">
        {position}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="text-muted-foreground text-xs">
          {item.state === "loading" && "読み込み中…"}
          {item.state === "error" && (
            <span className="text-destructive">読み込みに失敗しました</span>
          )}
          {item.state === "ready" &&
            `${item.numPages} ページ ・ ${formatFileSize(item.file.size)}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${position} 番目を上へ`}
          disabled={position <= 1}
          onClick={onMoveUp}
        >
          <ChevronUpIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${position} 番目を下へ`}
          disabled={position >= total}
          onClick={onMoveDown}
        >
          <ChevronDownIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${item.file.name} を一覧から削除`}
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
    </li>
  );
}

/**
 * 複数 PDF の結合インテーク画面。
 * 複数選択 → 順序の確認・修正 → 結合してビュアーへ、の流れを担う。
 */
export function MergeIntake({ onBack }: { onBack: () => void }) {
  const setFiles = useViewerStore((s) => s.setFiles);
  const [items, setItems] = useState<MergeItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 追加された各ファイルのページ数を非同期取得する。
  // proxy は数値取得後すぐ破棄し、リソースを保持しない。
  const loadPageCount = useCallback(async (id: string, file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const proxy = await loadPdfDocument(buffer);
      const numPages = proxy.numPages;
      void proxy.destroy();
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, numPages, state: "ready" } : it,
        ),
      );
    } catch {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, numPages: null, state: "error" } : it,
        ),
      );
    }
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;
      const pdfs = files.filter(isPdfFile);
      const rejected = files.length - pdfs.length;
      if (rejected > 0) {
        toast.error(
          `PDF 以外の ${rejected} 件を除外しました（PDF のみ結合できます）`,
        );
      }
      if (pdfs.length === 0) return;

      const newItems: MergeItem[] = pdfs.map((file) => ({
        id: createId("merge"),
        file,
        numPages: null,
        state: "loading",
      }));
      setItems((prev) => [...prev, ...newItems]);
      for (const it of newItems) void loadPageCount(it.id, it.file);
    },
    [loadPageCount],
  );

  const openPicker = () => inputRef.current?.click();

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  const moveItem = (from: number, to: number) =>
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      return arrayMove(prev, from, to);
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === active.id);
      const to = prev.findIndex((it) => it.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const hasError = items.some((it) => it.state === "error");
  const canMerge = items.length >= 2 && !hasError;

  const confirmMerge = () => {
    if (!canMerge) return;
    setFiles(items.map((it) => it.file));
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="単一ファイルの読み込みに戻る"
        onClick={onBack}
        className="absolute top-4 left-4 z-10"
      >
        <ArrowLeftIcon aria-hidden />
      </Button>

      <div className="mx-auto my-auto flex w-full max-w-xl flex-col items-center gap-4 p-8">
        <h1 className="text-2xl font-bold tracking-tight">複数 PDF を結合</h1>

        <div
          role="button"
          tabIndex={0}
          aria-label="結合する PDF の読み込み"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-zinc-300 dark:border-zinc-700",
          )}
        >
          <UploadIcon className="text-muted-foreground size-9" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">複数の PDF をドラッグ &amp; ドロップ</p>
            <p className="text-muted-foreground text-sm">
              またはクリックして複数選択
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {items.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {items.length} 件 ・ この順序で結合します
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={openPicker}
                >
                  <FilePlus2Icon aria-hidden />
                  PDF を追加
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setItems([])}
                >
                  <XIcon aria-hidden />
                  クリア
                </Button>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((it) => it.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1.5">
                  {items.map((item, index) => (
                    <SortableRow
                      key={item.id}
                      item={item}
                      position={index + 1}
                      total={items.length}
                      onMoveUp={() => moveItem(index, index - 1)}
                      onMoveDown={() => moveItem(index, index + 1)}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}

        <div className="flex w-full flex-col items-center gap-1">
          <Button
            type="button"
            size="lg"
            disabled={!canMerge}
            onClick={confirmMerge}
          >
            結合してビュアーで開く
          </Button>
          {items.length < 2 && (
            <p className="text-muted-foreground text-xs">
              2 つ以上の PDF を追加してください
            </p>
          )}
          {hasError && items.length >= 2 && (
            <p className="text-destructive text-xs">
              読み込みに失敗した PDF を削除してください
            </p>
          )}
        </div>
      </div>
    </>
  );
}
