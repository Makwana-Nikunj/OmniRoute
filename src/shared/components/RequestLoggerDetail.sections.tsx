"use client";

import { useState, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { JsonView } from "@/shared/components/jsonView";

import { useTheme } from "@/shared/hooks/useTheme";
import {
  useTimestampTitles,
  timestampMarkerCustomizeNode,
} from "@/shared/hooks/useTimestampTitles";
import { JsonTreeExpandControls } from "@/shared/components/JsonTreeExpandControls";
import { useJsonTreeExpandLevel } from "@/store/jsonTreeExpandStore";

// ─── Payload Code Block ─────────────────────────────────────────────────────
// Renders parsed payloads as a collapsible JSON tree (react18-json-view) so
// deeply nested request/response bodies (tool args, message arrays) can be
// collapsed instead of scrolled through as one raw text dump. Falls back to
// the plain <pre> dump for anything that isn't valid JSON (e.g. a captured
// error string), since json is display text sourced from JSON.stringify with
// a String() fallback on failure -- it is not guaranteed parseable.

export function PayloadSection({
  title,
  sectionId,
  json,
  onCopy,
  collapsible = true,
  defaultOpen = true,
}) {
  const t = useTranslations("requestLogger.detail");
  const { isDark } = useTheme();
  const resolvedSectionId = sectionId || title;
  const expandLevel = useJsonTreeExpandLevel(resolvedSectionId);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const treeContainerRef = useRef(null);

  const parsedJson = useMemo(() => {
    if (typeof json !== "string") return null;
    try {
      const value = JSON.parse(json);
      return value !== null && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }, [json]);

  const handleCopy = async () => {
    const success = await onCopy();
    if (success !== false) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useTimestampTitles(treeContainerRef, open && parsedJson !== null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] text-text-muted uppercase tracking-wider font-bold">
            {title}
          </h3>
          {collapsible && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="p-1 rounded hover:bg-bg-subtle text-text-muted hover:text-text-primary transition-colors"
              aria-label={open ? t("collapse", { title }) : t("expand", { title })}
            >
              <span className="material-symbols-outlined text-[16px]">
                {open ? "expand_less" : "expand_more"}
              </span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
            aria-label={t("copyTitle", { title })}
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? t("copied") : t("copy")}
          </button>
          {parsedJson !== null && <JsonTreeExpandControls sectionId={resolvedSectionId} />}
        </div>
      </div>
      {open && parsedJson !== null && (
        <div
          ref={treeContainerRef}
          className="rounded-xl bg-black/5 dark:bg-black/30 border border-border max-h-150 overflow-auto p-4 text-xs font-mono"
        >
          <JsonView
            src={parsedJson}
            dark={isDark}
            collapsed={expandLevel}
            customizeNode={timestampMarkerCustomizeNode}
            displaySize
          />
        </div>
      )}
      {open && parsedJson === null && (
        <pre className="p-4 rounded-xl bg-black/5 dark:bg-black/30 border border-border overflow-x-auto text-xs font-mono text-text-main max-h-150 overflow-y-auto leading-relaxed whitespace-pre-wrap break-words">
          {json}
        </pre>
      )}
    </div>
  );
}
