import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useChangePulse, useEntrance, useIncreasePulse, useSuccessFlash } from "./motion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** renderHook mínimo (sem @testing-library/dom). */
function renderHook<P, R>(hook: (props: P) => R, { initialProps }: { initialProps?: P } = {}) {
  const result = { current: undefined as R };
  const root = createRoot(document.createElement("div"));
  const Probe = (props: { p: P }) => {
    result.current = hook(props.p);
    return null;
  };
  const rerender = (p: P = initialProps as P) => act(() => root.render(createElement(Probe, { p })));
  rerender(initialProps as P);
  return { result, rerender };
}

describe("useChangePulse", () => {
  it("não anima na montagem e alterna classes a cada mudança", () => {
    const { result, rerender } = renderHook(({ v }) => useChangePulse(v), { initialProps: { v: "a_fazer" } });
    expect(result.current).toBe("");
    rerender({ v: "concluida" });
    expect(result.current).toBe("motion-pop-a");
    rerender({ v: "em_revisao" });
    expect(result.current).toBe("motion-pop-b");
    rerender({ v: "em_revisao" });
    expect(result.current).toBe("motion-pop-b");
  });
});

describe("useIncreasePulse", () => {
  it("pulsa só quando o número aumenta", () => {
    const { result, rerender } = renderHook(({ n }) => useIncreasePulse(n), { initialProps: { n: 2 } });
    expect(result.current).toBe("");
    rerender({ n: 1 });
    expect(result.current).toBe("");
    rerender({ n: 3 });
    expect(result.current).toBe("motion-bump-a");
  });
});

describe("useEntrance", () => {
  it("escalona os itens (máx. 10) e não reanima itens já vistos", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(() => useEntrance());
    const ids = Array.from({ length: 12 }, (_, i) => `id${i}`);
    const first = ids.map((id) => result.current(id));
    expect(first[0].className).toBe("motion-enter");
    expect((first[3].style as Record<string, number>)["--motion-i"]).toBe(3);
    expect((first[11].style as Record<string, number>)["--motion-i"]).toBe(10);
    vi.advanceTimersByTime(2000);
    rerender();
    expect(result.current("id0")).toEqual({});
    const fresh = result.current("novo");
    expect(fresh.className).toBe("motion-enter");
    expect((fresh.style as Record<string, number>)["--motion-i"]).toBe(0);
    vi.useRealTimers();
  });
});

describe("useSuccessFlash", () => {
  it("liga o sucesso, executa o `after` e volta ao normal", () => {
    vi.useFakeTimers();
    const after = vi.fn();
    const { result } = renderHook(() => useSuccessFlash(1200));
    act(() => result.current.flash(after, 600));
    expect(result.current.success).toBe(true);
    act(() => void vi.advanceTimersByTime(600));
    expect(after).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(600));
    expect(result.current.success).toBe(false);
    vi.useRealTimers();
  });
});
