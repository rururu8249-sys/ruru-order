"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type AdminSelectOption<T extends string> = { value: T; label: string; disabled?: boolean };
type Props<T extends string> = {
  label: string;
  value: T;
  options: readonly AdminSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

// Select-only combobox. Focus stays on the trigger, so a surrounding modal keeps
// its Tab order. Escape is consumed here only while this popup is open.
export default function AdminSelect<T extends string>({ label, value, options, onChange, disabled = false, className = "" }: Props<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 224, maxHeight: 384 });
  const selected = options.findIndex(option => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);

  const show = (index = selected) => {
    if (disabled || !enabled.length) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const width = Math.min(Math.max(rect.width, 224), vw - 16);
      const desired = Math.min(options.length * 44 + 8, 384);
      const below = vh - rect.bottom - 8;
      const above = rect.top - 8;
      const up = below < desired && above > below;
      const maxHeight = Math.max(44, Math.min(desired, up ? above : below));
      setPosition({
        top: up ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, vw - width - 8)), width, maxHeight,
      });
    }
    setActive(enabled.includes(index) ? index : enabled[0]);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const scrolled = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const resized = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resized);
    };
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || event.nativeEvent?.isComposing) return;
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Tab") {
      if (open) choose(active);
      return; // normal browser/parent modal Tab behavior
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const edge = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : undefined;
      if (!open) { show(edge ?? selected); return; }
      const next = edge ?? enabled[Math.max(0, Math.min(enabled.length - 1, enabled.indexOf(active) + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next !== undefined) setActive(next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const typed = event.key.toLocaleLowerCase("ko-KR");
      const previous = now - searchRef.current.at < 700 ? searchRef.current.text : "";
      const query = previous === typed ? typed : previous + typed;
      searchRef.current = { text: query, at: now };
      const start = open ? active : selected;
      const next = [...enabled.filter(index => index > start), ...enabled.filter(index => index <= start)]
        .find(index => options[index].label.toLocaleLowerCase("ko-KR").startsWith(query));
      if (next !== undefined) { event.preventDefault(); if (open) setActive(next); else show(next); }
    }
  };

  return (
    <div ref={rootRef} className={`min-w-0 ${className}`}>
      <button ref={triggerRef} type="button" role="combobox" aria-label={label}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled}
        onKeyDown={onKeyDown} onClick={() => open ? setOpen(false) : show()}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 text-left text-sm font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9">
        <span className="min-w-0 break-words">{options[selected]?.label ?? value}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" className={`shrink-0 ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <div ref={listRef} id={`${id}-list`} role="listbox" aria-label={label}
          className="fixed z-[80] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 text-ink shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          style={position}>
          {options.map((option, index) => (
            <div key={option.value} id={`${id}-option-${index}`} data-option-index={index}
              role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
              onMouseDown={event => event.preventDefault()}
              onPointerMove={() => { if (!option.disabled) setActive(index); }}
              onClick={() => choose(index)}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm ${option.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"} ${option.value === value ? "bg-ink font-semibold text-surface" : active === index ? "bg-surface-2 text-ink" : "text-ink"}`}>
              <span className="min-w-0 flex-1 break-words">{option.label}</span>
              {option.value === value ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
