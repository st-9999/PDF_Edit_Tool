import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useCtrlWheelZoom } from "./use-ctrl-wheel-zoom";

afterEach(cleanup);

function Harness({
  onZoomIn,
  onZoomOut,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const zoomRef = useCtrlWheelZoom({ onZoomIn, onZoomOut });
  return <div ref={zoomRef} data-testid="zone" />;
}

/** Ctrl/⌘ を押した wheel イベントを生成する（cancelable で preventDefault を検証可能に）。 */
function ctrlWheel(deltaY: number, ctrlKey = true): WheelEvent {
  return new WheelEvent("wheel", { deltaY, ctrlKey, cancelable: true });
}

describe("useCtrlWheelZoom", () => {
  it("Ctrl+ホイール上方向(deltaY<0)で onZoomIn を呼び、既定動作を抑止する", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const { getByTestId } = render(
      <Harness onZoomIn={onZoomIn} onZoomOut={onZoomOut} />,
    );
    const zone = getByTestId("zone");

    const event = ctrlWheel(-120);
    zone.dispatchEvent(event);

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).not.toHaveBeenCalled();
    // ブラウザ標準ズームを抑止していること（passive:false で preventDefault が効く）
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+ホイール下方向(deltaY>0)で onZoomOut を呼ぶ", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const { getByTestId } = render(
      <Harness onZoomIn={onZoomIn} onZoomOut={onZoomOut} />,
    );

    getByTestId("zone").dispatchEvent(ctrlWheel(120));

    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onZoomIn).not.toHaveBeenCalled();
  });

  it("Ctrl 未押下のホイールでは何もせず、既定動作も抑止しない（通常スクロール）", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const { getByTestId } = render(
      <Harness onZoomIn={onZoomIn} onZoomOut={onZoomOut} />,
    );

    const event = ctrlWheel(-120, false);
    getByTestId("zone").dispatchEvent(event);

    expect(onZoomIn).not.toHaveBeenCalled();
    expect(onZoomOut).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("アンマウント後はリスナが解除されコールバックを呼ばない", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const { getByTestId, unmount } = render(
      <Harness onZoomIn={onZoomIn} onZoomOut={onZoomOut} />,
    );
    const zone = getByTestId("zone");
    unmount();

    zone.dispatchEvent(ctrlWheel(-120));

    expect(onZoomIn).not.toHaveBeenCalled();
  });
});
