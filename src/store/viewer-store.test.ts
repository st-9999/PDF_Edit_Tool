import { describe, it, expect, beforeEach } from "vitest";
import {
  useViewerStore,
  clampPage,
  clampZoom,
  clampThumbnailWidth,
} from "./viewer-store";
import {
  THUMBNAIL_WIDTH_DEFAULT,
  THUMBNAIL_WIDTH_MAX,
  THUMBNAIL_WIDTH_MIN,
  THUMBNAIL_WIDTH_STEP,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/lib/pdf/constants";

beforeEach(() => {
  useViewerStore.setState({
    file: null,
    fileName: null,
    fileSize: null,
    numPages: 0,
    currentPage: 1,
    zoom: ZOOM_DEFAULT,
    fitMode: "width",
    status: "idle",
    error: null,
    thumbnailWidth: THUMBNAIL_WIDTH_DEFAULT,
  });
});

describe("clampPage", () => {
  it("下限 1・上限 numPages にクランプする", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-3, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(5, 10)).toBe(5);
  });

  it("numPages が 0 なら 1 を返す", () => {
    expect(clampPage(3, 0)).toBe(1);
  });

  it("小数は切り捨て、NaN は 1 にする", () => {
    expect(clampPage(2.9, 10)).toBe(2);
    expect(clampPage(Number.NaN, 10)).toBe(1);
  });
});

describe("clampZoom", () => {
  it("ZOOM_MIN / ZOOM_MAX にクランプする", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });

  it("非有限値は既定値にフォールバックする", () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_MAX);
  });
});

describe("clampThumbnailWidth", () => {
  it("下限・上限にクランプする", () => {
    expect(clampThumbnailWidth(10)).toBe(THUMBNAIL_WIDTH_MIN);
    expect(clampThumbnailWidth(9999)).toBe(THUMBNAIL_WIDTH_MAX);
    expect(clampThumbnailWidth(THUMBNAIL_WIDTH_DEFAULT)).toBe(
      THUMBNAIL_WIDTH_DEFAULT,
    );
  });

  it("小数は丸め、NaN は既定値にする", () => {
    expect(clampThumbnailWidth(140.4)).toBe(140);
    expect(clampThumbnailWidth(Number.NaN)).toBe(THUMBNAIL_WIDTH_DEFAULT);
  });
});

describe("サムネイル拡大縮小（ビュアー zoom と独立）", () => {
  it("thumbnailZoomIn / Out は STEP 分だけ増減する", () => {
    useViewerStore.setState({ thumbnailWidth: THUMBNAIL_WIDTH_DEFAULT });
    useViewerStore.getState().thumbnailZoomIn();
    expect(useViewerStore.getState().thumbnailWidth).toBe(
      THUMBNAIL_WIDTH_DEFAULT + THUMBNAIL_WIDTH_STEP,
    );
    useViewerStore.getState().thumbnailZoomOut();
    expect(useViewerStore.getState().thumbnailWidth).toBe(
      THUMBNAIL_WIDTH_DEFAULT,
    );
  });

  it("上限・下限を超えない", () => {
    useViewerStore.setState({ thumbnailWidth: THUMBNAIL_WIDTH_MAX });
    useViewerStore.getState().thumbnailZoomIn();
    expect(useViewerStore.getState().thumbnailWidth).toBe(THUMBNAIL_WIDTH_MAX);

    useViewerStore.setState({ thumbnailWidth: THUMBNAIL_WIDTH_MIN });
    useViewerStore.getState().thumbnailZoomOut();
    expect(useViewerStore.getState().thumbnailWidth).toBe(THUMBNAIL_WIDTH_MIN);
  });

  it("サムネイル幅の変更はビュアー zoom に影響しない（独立）", () => {
    useViewerStore.setState({
      zoom: ZOOM_DEFAULT,
      thumbnailWidth: THUMBNAIL_WIDTH_DEFAULT,
    });
    useViewerStore.getState().thumbnailZoomIn();
    expect(useViewerStore.getState().zoom).toBe(ZOOM_DEFAULT);
  });
});

describe("ページ送りの境界", () => {
  it("末尾で nextPage しても最終ページに留まる", () => {
    const s = useViewerStore.getState();
    s.setNumPages(3);
    s.setCurrentPage(2);
    s.nextPage();
    expect(useViewerStore.getState().currentPage).toBe(3);
    useViewerStore.getState().nextPage();
    expect(useViewerStore.getState().currentPage).toBe(3);
  });

  it("先頭で prevPage しても 1 ページ目に留まる", () => {
    const s = useViewerStore.getState();
    s.setNumPages(3);
    s.setCurrentPage(1);
    s.prevPage();
    expect(useViewerStore.getState().currentPage).toBe(1);
  });

  it("setCurrentPage は範囲外を [1, numPages] にクランプする", () => {
    const s = useViewerStore.getState();
    s.setNumPages(5);
    s.setCurrentPage(99);
    expect(useViewerStore.getState().currentPage).toBe(5);
    useViewerStore.getState().setCurrentPage(0);
    expect(useViewerStore.getState().currentPage).toBe(1);
  });

  it("ページ数が減ったとき現在ページを追従クランプする", () => {
    const s = useViewerStore.getState();
    s.setNumPages(10);
    s.setCurrentPage(8);
    useViewerStore.getState().setNumPages(3);
    expect(useViewerStore.getState().currentPage).toBe(3);
  });
});

describe("ズーム操作", () => {
  it("setZoom は範囲外をクランプし fitMode を actual にする", () => {
    useViewerStore.getState().setZoom(10);
    expect(useViewerStore.getState().zoom).toBe(ZOOM_MAX);
    expect(useViewerStore.getState().fitMode).toBe("actual");

    useViewerStore.getState().setZoom(0.01);
    expect(useViewerStore.getState().zoom).toBe(ZOOM_MIN);
  });

  it("zoomIn / zoomOut は上限・下限を超えない", () => {
    useViewerStore.setState({ zoom: ZOOM_MAX });
    useViewerStore.getState().zoomIn();
    expect(useViewerStore.getState().zoom).toBe(ZOOM_MAX);

    useViewerStore.setState({ zoom: ZOOM_MIN });
    useViewerStore.getState().zoomOut();
    expect(useViewerStore.getState().zoom).toBe(ZOOM_MIN);
  });

  it("zoomIn は ZOOM_STEP 分だけ増える", () => {
    useViewerStore.setState({ zoom: 1 });
    useViewerStore.getState().zoomIn();
    expect(useViewerStore.getState().zoom).toBeCloseTo(1 + ZOOM_STEP);
  });
});

describe("ファイル設定", () => {
  it("setFile でメタを設定し loading・既定ズームにリセットする", () => {
    useViewerStore.setState({ zoom: 2, numPages: 9, currentPage: 4 });
    const file = new File([new Uint8Array([1, 2, 3])], "sample.pdf", {
      type: "application/pdf",
    });
    useViewerStore.getState().setFile(file);
    const state = useViewerStore.getState();
    expect(state.fileName).toBe("sample.pdf");
    expect(state.fileSize).toBe(3);
    expect(state.status).toBe("loading");
    expect(state.zoom).toBe(ZOOM_DEFAULT);
    expect(state.currentPage).toBe(1);
  });

  it("clearFile で初期状態へ戻す", () => {
    const file = new File([new Uint8Array([1])], "a.pdf");
    useViewerStore.getState().setFile(file);
    useViewerStore.getState().clearFile();
    const state = useViewerStore.getState();
    expect(state.file).toBeNull();
    expect(state.mergeFiles).toEqual([]);
    expect(state.numPages).toBe(0);
    expect(state.status).toBe("idle");
  });

  it("setFiles で先頭を file、残りを mergeFiles に設定し既定名 merged.pdf にする", () => {
    const a = new File([new Uint8Array([1, 2])], "a.pdf");
    const b = new File([new Uint8Array([3])], "b.pdf");
    const c = new File([new Uint8Array([4, 5, 6])], "c.pdf");
    useViewerStore.getState().setFiles([a, b, c]);
    const state = useViewerStore.getState();
    expect(state.file).toBe(a);
    expect(state.mergeFiles).toEqual([b, c]);
    expect(state.fileName).toBe("merged.pdf");
    // fileSize は全ファイルの合計
    expect(state.fileSize).toBe(2 + 1 + 3);
    expect(state.status).toBe("loading");
  });

  it("setFiles に 1 件だけ渡すと結合せず元のファイル名を使う", () => {
    const only = new File([new Uint8Array([1])], "single.pdf");
    useViewerStore.getState().setFiles([only]);
    const state = useViewerStore.getState();
    expect(state.file).toBe(only);
    expect(state.mergeFiles).toEqual([]);
    expect(state.fileName).toBe("single.pdf");
  });

  it("setFiles に空配列を渡しても状態を変更しない", () => {
    const prev = new File([new Uint8Array([9])], "prev.pdf");
    useViewerStore.getState().setFile(prev);
    useViewerStore.getState().setFiles([]);
    expect(useViewerStore.getState().file).toBe(prev);
  });

  it("setFile は前回の mergeFiles をクリアする", () => {
    const a = new File([new Uint8Array([1])], "a.pdf");
    const b = new File([new Uint8Array([2])], "b.pdf");
    useViewerStore.getState().setFiles([a, b]);
    const single = new File([new Uint8Array([3])], "single.pdf");
    useViewerStore.getState().setFile(single);
    const state = useViewerStore.getState();
    expect(state.file).toBe(single);
    expect(state.mergeFiles).toEqual([]);
    expect(state.fileName).toBe("single.pdf");
  });
});
