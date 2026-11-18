"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Một vùng nút duy nhất: đo chiều cao để chừa chỗ; desktop trở về luồng trang. */
export function ActionArea({ children }: { children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    let frame = 0;
    // Tab có thể chỉ cuộn ô nhập tới đáy viewport, phía sau thanh fixed.
    const revealFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !active.matches("input, textarea, select, button, a, [tabindex], [contenteditable='true']")) return;
        if (element.contains(active) || getComputedStyle(element).position !== "fixed") return;
        const rect = active.getBoundingClientRect();
        const bottom = element.getBoundingClientRect().top - 16;
        let end = rect.bottom;
        for (const id of active.getAttribute("aria-describedby")?.split(/\s+/) ?? []) {
          const description = document.getElementById(id);
          if (!description || getComputedStyle(description).visibility !== "visible") continue;
          const bounds = description.getBoundingClientRect();
          if (bounds.height > 0) end = Math.max(end, bounds.bottom);
        }
        // Giữ cả ô và lời giải thích khi vừa vùng nhìn; mô tả quá dài vẫn cuộn đọc được.
        const targetBottom = end - rect.top <= bottom - 16 ? end : rect.bottom;
        if (rect.height > 0 && targetBottom > bottom) {
          window.scrollBy({ top: targetBottom - bottom, behavior: "instant" });
        }
      });
    };
    const measure = () => {
      setHeight(element.getBoundingClientRect().height);
      revealFocus();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    const viewport = window.visualViewport;
    // Khi bàn phím thu nhỏ visual viewport, trả nút vào luồng để input/lỗi vẫn cuộn tới được.
    // Pinch zoom không phải bàn phím; không đổi vị trí chỉ vì người dùng phóng to.
    const updateKeyboard = () => {
      const editing = document.activeElement?.matches("input, textarea, [contenteditable='true']");
      setKeyboardOpen(Boolean(editing && viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 150));
      revealFocus();
    };
    viewport?.addEventListener("resize", updateKeyboard);
    window.addEventListener("resize", updateKeyboard);
    document.addEventListener("focusin", updateKeyboard);
    document.addEventListener("focusout", updateKeyboard);
    updateKeyboard();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", updateKeyboard);
      window.removeEventListener("resize", updateKeyboard);
      document.removeEventListener("focusin", updateKeyboard);
      document.removeEventListener("focusout", updateKeyboard);
    };
  }, []);

  return (
    <div
      className="action-area"
      data-keyboard-open={keyboardOpen || undefined}
      style={{ "--action-area-height": `${height}px` } as CSSProperties}
    >
      <div className="action-area-spacer" aria-hidden="true" />
      <div ref={bar} className="action-area-bar">
        <div className="action-area-content">{children}</div>
      </div>
    </div>
  );
}
