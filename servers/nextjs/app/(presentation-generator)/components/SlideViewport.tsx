"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;

function computeScale(el: HTMLElement): number {
  const clientW = el.clientWidth || SLIDE_WIDTH;
  const clientH = el.clientHeight || SLIDE_HEIGHT;
  const scrollW = el.scrollWidth || clientW;
  const scrollH = el.scrollHeight || clientH;

  if (scrollW <= clientW + 1 && scrollH <= clientH + 1) return 1;

  const scale = Math.min(clientW / scrollW, clientH / scrollH);
  // Keep things readable; also reserve a tiny margin.
  return Math.max(0.6, Math.min(1, scale * 0.99));
}

export default function SlideViewport({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const update = () => setScale(computeScale(el));

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const dx = (SLIDE_WIDTH - SLIDE_WIDTH * scale) / 2;
  const dy = (SLIDE_HEIGHT - SLIDE_HEIGHT * scale) / 2;

  return (
    <div
      className={[
        "w-full max-w-[1280px] mx-auto aspect-video overflow-hidden rounded-sm bg-white shadow-lg border border-black/10",
        className,
      ].join(" ")}
    >
      <div
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          ref={contentRef}
          className="w-[1280px] h-[720px] overflow-hidden"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

