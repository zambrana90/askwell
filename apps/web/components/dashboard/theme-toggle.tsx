"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  THEME_CHOICES,
  applyThemeChoice,
  readThemeChoice,
  saveThemeChoice,
  type ThemeChoice,
} from "../../lib/theme";
import { CLICKABLE } from "../ui/interactive";

const LABELS: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", system: "System" };

const ICONS: Record<ThemeChoice, string> = {
  light: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  dark: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  system: "M4 5h16v11H4zM9 20h6M12 16v4",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Read the stored choice after mount; the server can't know it. Apply it too:
    // the inline init script doesn't run on a client-side navigation.
    const stored = readThemeChoice();
    applyThemeChoice(document.documentElement, stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(stored);
  }, []);

  function select(next: ThemeChoice) {
    setChoice(next);
    saveThemeChoice(next);
    applyThemeChoice(document.documentElement, next);
  }

  // Radio-group keyboard behavior: arrows move focus and selection, wrapping around.
  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const nextIndex = (index + step + THEME_CHOICES.length) % THEME_CHOICES.length;
    const next = THEME_CHOICES[nextIndex];
    if (!next) return;
    select(next);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-glass border border-glass-edge p-0.5">
      {THEME_CHOICES.map((value, index) => (
        <button
          key={value}
          ref={(el) => {
            buttons.current[index] = el;
          }}
          tabIndex={choice === value ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, index)}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={LABELS[value]}
          title={LABELS[value]}
          onClick={() => select(value)}
          className={`inline-flex size-10 items-center justify-center rounded-glass text-ink-muted ${CLICKABLE} hover:bg-ink/15 hover:text-ink active:bg-ink/25 aria-checked:bg-accent aria-checked:text-accent-ink aria-checked:hover:bg-accent/80 aria-checked:hover:text-accent-ink`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICONS[value]} />
          </svg>
        </button>
      ))}
    </div>
  );
}
