"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import ContextMenu, { type ContextMenuEntry } from "@/components/ContextMenu";

type MenuState = { x: number; y: number; entries: ContextMenuEntry[] };

type Ctx = {
  /** Открыть меню по событию ПКМ. Гасит родное меню и всплытие. */
  openContextMenu: (e: React.MouseEvent, entries: ContextMenuEntry[]) => void;
  closeContextMenu: () => void;
};

const ContextMenuContext = createContext<Ctx>({
  openContextMenu: () => {},
  closeContextMenu: () => {},
});

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MenuState | null>(null);

  const openContextMenu = useCallback(
    (e: React.MouseEvent, entries: ContextMenuEntry[]) => {
      e.preventDefault();
      e.stopPropagation();
      if (entries.length === 0) return;
      setState({ x: e.clientX, y: e.clientY, entries });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setState(null), []);

  const value = useMemo<Ctx>(
    () => ({ openContextMenu, closeContextMenu }),
    [openContextMenu, closeContextMenu],
  );

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {state && (
        <ContextMenu
          x={state.x}
          y={state.y}
          entries={state.entries}
          onClose={closeContextMenu}
        />
      )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu(): Ctx {
  return useContext(ContextMenuContext);
}
