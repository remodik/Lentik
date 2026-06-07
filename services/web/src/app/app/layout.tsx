"use client";

import { ContextMenuProvider } from "@/lib/useContextMenu";

export default function AppSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ContextMenuProvider>{children}</ContextMenuProvider>;
}
