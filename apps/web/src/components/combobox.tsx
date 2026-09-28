"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Field, cx, inputClass } from "./ui";

/**
 * Text field with a list of suggestions, built to the ARIA 1.2 combobox pattern.
 * It owns the keyboard and the markup; fetching and filtering stay with the
 * caller, so the same control serves the place search and the local stop list.
 */

export interface ComboboxProps<T> {
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  items: readonly T[];
  itemKey: (item: T) => string;
  /** the line shown in the list; a string keeps it simple, a node allows two lines */
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  loading?: boolean;
  /** why the list is empty, or how many places were found */
  statusText?: string;
  /** stays at the bottom of the list, e.g. "place the point on the map instead" */
  footerAction?: { label: string; onSelect: () => void };
  /** hides the list until this many characters are typed */
  minChars?: number;
}

export function Combobox<T>({
  label,
  hint,
  error,
  placeholder,
  query,
  onQueryChange,
  items,
  itemKey,
  renderItem,
  onSelect,
  loading = false,
  statusText,
  footerAction,
  minChars = 3,
}: ComboboxProps<T>) {
  const base = useId();
  const listId = `${base}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // The footer counts as the last option, so the keyboard can reach it too.
  const optionCount = items.length + (footerAction ? 1 : 0);
  const listVisible = open && query.trim().length >= minChars && (optionCount > 0 || loading || Boolean(statusText));
  const optionId = (index: number) => `${base}-option-${index}`;

  function choose(index: number) {
    if (footerAction && index === items.length) {
      footerAction.onSelect();
    } else {
      const item = items[index];
      if (!item) return;
      onSelect(item);
    }
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Close the list but keep the focus: the text is usually still wanted.
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!optionCount) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((prev) => {
        const next = prev + step;
        if (next >= optionCount) return 0;
        if (next < 0) return optionCount - 1;
        return next;
      });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(optionCount - 1);
      return;
    }
    if (event.key === "Enter") {
      // Without this the Enter that picks a suggestion also submits the form.
      if (active >= 0) {
        event.preventDefault();
        choose(active);
      }
    }
  }

  return (
    <div className="relative">
      <Field label={label} hint={hint} error={error}>
        <input
          ref={inputRef}
          className={inputClass}
          type="text"
          role="combobox"
          aria-expanded={listVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={listVisible && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </Field>

      {listVisible ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-[1100] mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {loading && items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ищем…</li>
          ) : null}

          {items.map((item, index) => (
            <li
              key={itemKey(item)}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // mousedown, not click: blur would close the list first
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onMouseEnter={() => setActive(index)}
              className={cx(
                "cursor-pointer px-3 py-2 text-sm",
                index === active ? "bg-primary-soft text-primary" : "hover:bg-muted",
              )}
            >
              {renderItem(item)}
            </li>
          ))}

          {!loading && items.length === 0 && statusText ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{statusText}</li>
          ) : null}

          {footerAction ? (
            <li
              id={optionId(items.length)}
              role="option"
              aria-selected={items.length === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(items.length);
              }}
              onMouseEnter={() => setActive(items.length)}
              className={cx(
                "cursor-pointer border-t border-border px-3 py-2 text-sm font-medium",
                items.length === active ? "bg-primary-soft text-primary" : "text-primary hover:bg-muted",
              )}
            >
              {footerAction.label}
            </li>
          ) : null}
        </ul>
      ) : null}

      <p role="status" className="sr-only">
        {loading ? "Ищем места" : statusText}
      </p>
    </div>
  );
}
