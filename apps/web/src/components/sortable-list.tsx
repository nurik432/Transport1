"use client";

import { useState } from "react";

/**
 * Reordering a short list by dragging, on native HTML5 drag and drop.
 *
 * A hook rather than a component: the caller owns the markup, and the rows here
 * are form rows with inputs in them. No dependency is added for this — the list
 * is a couple of dozen items, single-axis and not virtualised, which is exactly
 * the case a drag-and-drop library does not pay for.
 *
 * Touch is the accepted gap: HTML5 drag and drop does not fire for it, so the
 * caller must keep the up/down buttons, which are needed for the keyboard
 * anyway.
 */

export interface SortableList {
  /** spread on the small grab handle, never on the whole row */
  handleProps: (index: number) => {
    draggable: true;
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** spread on the row itself, so the whole row is a drop target */
  rowProps: (index: number) => {
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (event: React.DragEvent) => void;
  };
  dragIndex: number | null;
  /** the row the pointer is over, to draw the insertion line */
  overIndex: number | null;
}

export function useSortable(onReorder: (from: number, to: number) => void): SortableList {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return {
    dragIndex,
    overIndex,

    handleProps: (index) => ({
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without data on the transfer.
        event.dataTransfer.setData("text/plain", String(index));
        setDragIndex(index);
      },
      onDragEnd: () => {
        setDragIndex(null);
        setOverIndex(null);
      },
    }),

    rowProps: (index) => ({
      onDragOver: (event) => {
        if (dragIndex === null) return;
        // Without preventDefault the drop never happens at all.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (index !== overIndex) setOverIndex(index);
      },
      onDragLeave: () => {
        if (overIndex === index) setOverIndex(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        const from = dragIndex ?? Number(event.dataTransfer.getData("text/plain"));
        setDragIndex(null);
        setOverIndex(null);
        if (Number.isInteger(from) && from !== index) onReorder(from, index);
      },
    }),
  };
}
