"use client";
import { useRef, useState, useEffect } from "react";
import { ArrowUp } from "@phosphor-icons/react";

export function Composer({ value, onChange, onSubmit, placeholder, disabled, autoFocus, hint }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  placeholder: string; disabled?: boolean; autoFocus?: boolean; hint?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const canSend = !!value.trim() && !disabled;
  return (
    <div className="w-full bg-white rounded-composer transition-all" style={{
      border: `1px solid ${focused ? "rgba(17,17,17,0.18)" : "rgba(17,17,17,0.08)"}`,
      boxShadow: focused ? "0 1px 2px rgba(17,17,17,0.04), 0 12px 40px rgba(17,17,17,0.06)" : "0 1px 2px rgba(17,17,17,0.03)",
    }}>
      <textarea
        ref={ref} value={value} rows={1} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={e => { onChange(e.target.value); const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 200)}px`; }}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
        className="w-full resize-none outline-none bg-transparent text-ink placeholder:text-ink-30"
        style={{ fontSize: 15.5, lineHeight: 1.5, padding: "16px 18px 2px 18px", minHeight: 52 }}
      />
      <div className="flex items-center justify-end gap-3 px-3 pb-2.5 pt-1">
        {hint && <span className="mono text-[11px] text-ink-30">{hint}</span>}
        <button onClick={onSubmit} disabled={!canSend} aria-label="Send"
          className="flex items-center justify-center rounded-control transition-colors"
          style={{ width: 34, height: 34, background: canSend ? "#111" : "#F0F0EE", color: canSend ? "#fff" : "#B9B9B2" }}
          onMouseEnter={e => { if (canSend) e.currentTarget.style.background = "#EA580C"; }}
          onMouseLeave={e => { if (canSend) e.currentTarget.style.background = "#111"; }}>
          <ArrowUp size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
