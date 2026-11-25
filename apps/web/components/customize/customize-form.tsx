"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  MAX_WIDGET_HEADER_LENGTH,
  MAX_WIDGET_LABEL_LENGTH,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type ApiError,
  type UpdateConfigResponse,
  type WidgetConfig,
} from "@askwell/shared";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";
import { POSITION_LABELS, isHexColor } from "./preview-utils";
import { WidgetPreview } from "./widget-preview";
import { FIELD, FOCUS_RING, INLINE_LINK } from "../ui/interactive";

type Props = {
  projectId: string;
  /** Pro: the saved config. Free: the defaults. Read on the server. */
  initialConfig: WidgetConfig;
  /** The plan, read on the server. The API stays the real check. */
  canCustomize: boolean;
  upgradeHref?: string;
};

/** Friendly text for the visitor-facing owner. Never shows server messages. */
export function saveErrorMessage(status: number, code: string | undefined): string {
  if (status === 402 || code === "payment_required") return "Customizing the widget is a Pro feature. Upgrade to save changes.";
  if (status === 400 || code === "validation_error") return "Some settings are not valid. Check the fields and try again.";
  return "Something went wrong. Please try again.";
}

const field = `min-h-10 w-full rounded-glass border border-glass-edge bg-glass px-3 py-2 text-sm disabled:opacity-60 ${FIELD}`;
/** Radios and the checkbox. */
const CHOICE = `cursor-pointer disabled:cursor-default ${FOCUS_RING}`;

export function CustomizeForm({ projectId, initialConfig, canCustomize, upgradeHref = "/dashboard/billing" }: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [hex, setHex] = useState(initialConfig.buttonColor);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setNotice(null);
  };

  function onHex(value: string) {
    setHex(value);
    if (isHexColor(value)) set("buttonColor", value.toLowerCase());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canCustomize || saving) return;
    if (!isHexColor(hex)) {
      setNotice({ kind: "error", text: "Enter the color as a hex value like #1a73e8." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const json: unknown = await res.json().catch(() => null);
      if (res.ok) {
        const saved = (json as UpdateConfigResponse).config;
        setConfig(saved);
        setHex(saved.buttonColor);
        setNotice({ kind: "ok", text: "Saved. Your site shows the new look the next time the page loads." });
      } else {
        setNotice({ kind: "error", text: saveErrorMessage(res.status, (json as ApiError | null)?.error?.code) });
      }
    } catch {
      setNotice({ kind: "error", text: "Could not reach the server. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className="p-4">
        {!canCustomize ? (
          <div role="note" className="mb-4 rounded-glass border border-glass-edge bg-glass px-3 py-3 text-sm">
            <p className="font-medium">Customizing is a Pro feature.</p>
            <p className="mt-1 text-ink-muted">
              Free widgets use the default look and show the &quot;Powered by&quot; badge.{" "}
              <Link href={upgradeHref} className={INLINE_LINK}>
                Upgrade to Pro
              </Link>{" "}
              to change it.
            </p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {/* Disabled while saving too, so an edit made mid-request can't be overwritten by the response. */}
          <fieldset disabled={!canCustomize || saving} className="flex flex-col gap-5 border-0 p-0">
            <div className="flex flex-col gap-1">
              <label htmlFor="cz-color" className="text-sm font-medium">
                Button color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="cz-color"
                  type="color"
                  value={config.buttonColor}
                  onChange={(e) => onHex(e.target.value)}
                  className={`h-10 w-14 cursor-pointer rounded-glass border border-glass-edge bg-glass p-1 disabled:cursor-not-allowed disabled:opacity-60 ${FIELD}`}
                />
                <input
                  aria-label="Button color (hex)"
                  value={hex}
                  onChange={(e) => onHex(e.target.value)}
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={!isHexColor(hex) || undefined}
                  className={`${field} max-w-32 font-mono`}
                />
              </div>
            </div>

            <fieldset className="flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">Position</legend>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_POSITIONS.map((p) => (
                  <label
                    key={p}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-glass border border-glass-edge bg-glass px-3 py-2 text-sm motion-safe:transition hover:border-ink/60 hover:bg-ink/10 active:bg-ink/20 has-[:checked]:border-accent has-[:checked]:hover:border-accent has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-glass has-[:disabled]:not-has-[:checked]:hover:border-glass-edge"
                  >
                    <input
                      type="radio"
                      name="cz-position"
                      value={p}
                      checked={config.position === p}
                      onChange={() => set("position", p)}
                      className={CHOICE}
                    />
                    {POSITION_LABELS[p]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <label htmlFor="cz-label" className="text-sm font-medium">
                Button label
              </label>
              <input
                id="cz-label"
                value={config.label}
                maxLength={MAX_WIDGET_LABEL_LENGTH}
                onChange={(e) => set("label", e.target.value)}
                className={field}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="cz-animation" className="text-sm font-medium">
                Animation
              </label>
              <select
                id="cz-animation"
                value={config.animation}
                onChange={(e) => set("animation", e.target.value as WidgetConfig["animation"])}
                className={`${field} cursor-pointer disabled:cursor-default`}
              >
                {WIDGET_ANIMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {a[0]!.toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="cz-header" className="text-sm font-medium">
                Header text
              </label>
              <input
                id="cz-header"
                value={config.headerText}
                maxLength={MAX_WIDGET_HEADER_LENGTH}
                onChange={(e) => set("headerText", e.target.value)}
                className={field}
              />
            </div>

            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm underline-offset-4 hover:underline has-[:disabled]:cursor-default has-[:disabled]:hover:no-underline">
              <input
                type="checkbox"
                checked={config.showBadge}
                onChange={(e) => set("showBadge", e.target.checked)}
                className={CHOICE}
              />
              Show the &quot;Powered by&quot; badge
            </label>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} disabled={!canCustomize}>
              Save
            </Button>
            {notice ? (
              <p role={notice.kind === "error" ? "alert" : "status"} className="text-sm">
                {notice.text}
              </p>
            ) : null}
          </div>
        </form>
      </Panel>

      <WidgetPreview config={config} />
    </div>
  );
}
