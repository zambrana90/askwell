import type { ReactNode } from "react";

/** The side buttons: position and length only, so they stay generic. */
const SIDE_BUTTONS = ["-left-[3px] top-28 h-8", "-left-[3px] top-44 h-14", "-left-[3px] top-60 h-14", "-right-[3px] top-48 h-20"];

/**
 * A generic phone drawn in CSS around its children, which fill the screen. Below `sm` there
 * is no bezel (a phone inside a phone looks odd): just a full-width card. The children are
 * rendered once for both, so a chat keeps its state when the window is resized.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full sm:w-fit">
      <div aria-hidden="true" className="pointer-events-none absolute -inset-12 hidden rounded-full bg-ink/10 blur-3xl sm:block" />
      {SIDE_BUTTONS.map((place) => (
        <span key={place} aria-hidden="true" className={`absolute hidden w-[3px] rounded-sm bg-ink/30 sm:block ${place}`} />
      ))}
      {/* The body: black, with a thin grey highlight on its edge. */}
      <div data-phone="body" className="relative sm:rounded-[48px] sm:bg-black sm:p-3 sm:ring-1 sm:ring-ink/30">
        <div
          data-phone="screen"
          className="flex h-[480px] flex-col overflow-hidden rounded-glass border border-glass-edge bg-canvas shadow-glass sm:h-[680px] sm:w-[340px] sm:rounded-[36px] sm:pb-2 sm:shadow-none md:h-[720px] md:w-[360px]"
        >
          <div aria-hidden="true" className="hidden h-9 shrink-0 items-center justify-center sm:flex">
            <span className="h-6 w-24 rounded-full bg-black ring-1 ring-ink/15" />
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
