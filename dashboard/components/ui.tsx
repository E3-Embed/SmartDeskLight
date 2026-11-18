"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { STATE_META, type LampState } from "@/lib/derive";

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function svgProps(size: number, className: string | undefined, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function IconBook({ size = 18, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19" />
    </svg>
  );
}

export function IconCode({ size = 18, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="m9 8-4 4 4 4" />
      <path d="m15 8 4 4-4 4" />
    </svg>
  );
}

export function IconPalette({ size = 18, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" />
      <circle cx="8" cy="9" r="1" />
      <circle cx="12" cy="7" r="1" />
      <circle cx="16" cy="9.5" r="1" />
    </svg>
  );
}

export function IconArrowUp({ size = 16, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

export function IconArrowDown({ size = 16, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}

export function IconLock({ size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </svg>
  );
}

export function IconSun({ size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

export function IconMoon({ size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function IconAlert({ size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M12 4 3.5 19h17z" />
      <path d="M12 9v4.5" />
      <circle cx="12" cy="16.5" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheck({ size = 16, className, strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconWifi({ size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M3.5 8.5a12 12 0 0 1 17 0" />
      <path d="M6.5 12a8 8 0 0 1 11 0" />
      <path d="M9.5 15.5a4 4 0 0 1 5 0" />
      <circle cx="12" cy="19" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSpark({ size = 16, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z" />
    </svg>
  );
}

export function IconRadio({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" opacity="0.5" />
    </svg>
  );
}

export function IconClock({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

export function IconCpu({ size = 14, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 2.8V7M14 2.8V7M10 17v4.2M14 17v4.2M2.8 10H7M2.8 14H7M17 10h4.2M17 14h4.2" />
    </svg>
  );
}

export function IconActivity({ size = 14, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M2.8 12h4l2.2-6 3.6 12 2.4-6h6" />
    </svg>
  );
}

export function IconInbox({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M3 13.5 5.2 5h13.6L21 13.5V19H3z" />
      <path d="M3 13.5h5l1.4 2h5.2l1.4-2h5" />
    </svg>
  );
}

export function IconUser({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function IconLamp({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M8.6 3.6h6.8l3.4 7.2H5.2z" />
      <path d="M12 10.8v4.4" />
      <path d="M9.2 18.6h5.6" />
      <path d="M10 21.2h4" />
      <path d="M12 15.2c1.2 0 1.2 1.6 0 1.6s-1.2-1.6 0-1.6z" />
    </svg>
  );
}

export function IconX({ size = 14, className, strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconBell({ size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="M18 16H6l1.4-2.2V10a4.6 4.6 0 0 1 9.2 0v3.8z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

export function IconChevron({ size = 12, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconSquare({ size = 14, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
    </svg>
  );
}

export function IconRound({ size = 14, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <rect x="4" y="4" width="16" height="16" rx="6" />
    </svg>
  );
}

export function IconGrid({ size = 14, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...svgProps(size, className, strokeWidth)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  icon,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`select flex items-center justify-between gap-1.5 ${className}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {icon ? <span className="shrink-0 opacity-70">{icon}</span> : null}
        <span className="truncate">{selected?.label}</span>
        <IconChevron size={11} className={`shrink-0 opacity-60 ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[70] overflow-hidden border border-line bg-surface py-1 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                    active
                      ? "bg-amber-soft text-amber-deep"
                      : "text-ink hover:bg-surface-2"
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] font-medium leading-snug">
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="truncate text-[10.5px] leading-snug text-muted">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  {active ? <IconCheck size={11} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function subscribeCorners(callback: () => void) {
  window.addEventListener("sdl-corners", callback);
  return () => window.removeEventListener("sdl-corners", callback);
}

function cornersSnapshot(): "round" | "sharp" {
  return document.documentElement.dataset.corners === "sharp" ? "sharp" : "round";
}

export function CornersToggle() {
  const corners = useSyncExternalStore(subscribeCorners, cornersSnapshot, () => "round" as const);

  const toggle = () => {
    const next = corners === "sharp" ? "round" : "sharp";
    document.documentElement.dataset.corners = next;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("corners", next);
      window.history.replaceState(null, "", url);
      localStorage.setItem("sdl-corners", next);
    } catch {
      // private mode
    }
    window.dispatchEvent(new Event("sdl-corners"));
  };

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={corners === "sharp" ? "เปลี่ยนเป็นมุมโค้ง" : "เปลี่ยนเป็นมุมคม"}
      title={corners === "sharp" ? "มุมโค้ง" : "มุมคม"}
    >
      {corners === "sharp" ? <IconRound size={14} /> : <IconSquare size={14} />}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionHead({
  title,
  en,
  right,
}: {
  title: string;
  en?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold leading-tight text-ink">{title}</h2>
        {en ? <p className="label mt-0.5 truncate">{en}</p> : null}
      </div>
      {right}
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  ok: "chip-ok",
  warn: "chip-warn",
  alert: "chip-alert",
  safe: "chip-safe",
  idle: "chip",
};

export function StateChip({ state }: { state: LampState }) {
  const meta = STATE_META[state];
  return (
    <span className={`chip ${TONE_CLASS[meta.tone]}`}>
      <span className="font-medium">{meta.th}</span>
      <span className="opacity-60">{meta.en}</span>
    </span>
  );
}

export function Dot({
  tone = "idle",
  pulse = false,
}: {
  tone?: "ok" | "warn" | "alert" | "safe" | "idle";
  pulse?: boolean;
}) {
  const color =
    tone === "ok"
      ? "var(--sage)"
      : tone === "warn"
        ? "var(--amber)"
        : tone === "alert"
          ? "var(--brick)"
          : tone === "safe"
            ? "var(--blue)"
            : "var(--muted)";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${pulse ? "pulse" : ""}`}
      style={{ background: color }}
    />
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="label truncate">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="num text-[18.5px] font-medium leading-none text-ink">{value}</span>
        {unit ? <span className="text-[11.5px] text-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 truncate text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  );
}
