"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ActiveTiptapToolbarState = {
  editor: any | null;
  textStyle?: { fontFamily?: string; fontSize?: number };
  onTextStyleChange?: (style: { fontFamily?: string; fontSize?: number }) => void;
};

type ActiveTiptapToolbarContextValue = {
  active: ActiveTiptapToolbarState | null;
  setActive: (next: ActiveTiptapToolbarState | null) => void;
  clearIfEditor: (editor: any | null | undefined) => void;
};

const Ctx = createContext<ActiveTiptapToolbarContextValue | null>(null);

export function ActiveTiptapToolbarProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState<ActiveTiptapToolbarState | null>(null);

  const setActive = useCallback((next: ActiveTiptapToolbarState | null) => {
    setActiveState(next);
  }, []);

  const clearIfEditor = useCallback((editor: any | null | undefined) => {
    setActiveState((prev) => {
      if (!prev) return prev;
      if (!editor) return null;
      return prev.editor === editor ? null : prev;
    });
  }, []);

  const value = useMemo(
    () => ({
      active,
      setActive,
      clearIfEditor,
    }),
    [active, setActive, clearIfEditor]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveTiptapToolbar() {
  return useContext(Ctx);
}

