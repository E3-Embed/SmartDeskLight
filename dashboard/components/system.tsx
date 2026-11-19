"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import type { Derived } from "@/lib/derive";
import {
  formatClock,
  formatDuration,
  formatPercent,
} from "@/lib/format";
import { MOCK_SCENARIOS, type Alert, type MockScenario, type PublicState } from "@/lib/types";
import {
  Dot,
  IconActivity,
  IconAlert,
  IconBell,
  IconCheck,
  IconClock,
  IconCode,
  IconCpu,
  IconInbox,
  IconLock,
  IconPalette,
  IconRadio,
  IconSpark,
  IconWifi,
  IconX,
  Select,
} from "./ui";

export type Severity = "safe" | "alert" | "ok" | "info";

export function severity(text: string): Severity {
  const lower = text.toLowerCase();
  if (lower.includes("safe") || text.includes("หยุด")) return "safe";
  if (
    /(no data|ไม่มีข้อมูล|offline|ออฟไลน์|panic|dropped|ขัดข้อง|fault|error)/.test(lower)
  ) {
    return "alert";
  }
  if (/(restored|กลับมา|resumed|back|online)/.test(lower)) return "ok";
  return "info";
}

const SEVERITY_STYLE: Record<Severity, { text: string; bg: string; border: string; icon: typeof IconAlert }> = {
  safe: { text: "text-blue", bg: "bg-blue-soft", border: "border-blue/40", icon: IconLock },
  alert: { text: "text-brick", bg: "bg-brick-soft", border: "border-brick/40", icon: IconAlert },
  ok: { text: "text-sage", bg: "bg-sage-soft", border: "border-sage/40", icon: IconCheck },
  info: { text: "text-muted", bg: "bg-surface-2/60", border: "border-line", icon: IconBell },
};

export function ConnectionBadge({
  state,
  live,
}: {
  state: PublicState | null;
  live: "connecting" | "open" | "closed";
}) {
  const offline =
    state?.link === "offline" || state?.link === "error" || state?.status === "offline";

  let label = "กำลังเชื่อมต่อ";
  let tone: "ok" | "warn" | "alert" | "idle" = "warn";
  let pulse = true;

  if (live === "open" && state && !offline) {
    label = "ออนไลน์";
    tone = "ok";
    pulse = false;
  } else if (live === "open" && offline) {
    label = state?.status === "offline" ? "เกตเวย์ออฟไลน์" : "ขาดการเชื่อมต่อ";
    tone = "alert";
    pulse = false;
  } else if (live === "closed") {
    label = "หลุดการเชื่อมต่อ";
    tone = "alert";
    pulse = false;
  }

  return (
    <span
      className={`chip ${tone === "ok" ? "chip-ok" : tone === "alert" ? "chip-alert" : tone === "warn" ? "chip-warn" : ""}`}
      title={state?.linkError ?? undefined}
    >
      <Dot tone={tone} pulse={pulse} />
      <span className="font-medium">{label}</span>
      {state?.source === "mock" ? (
        <span className="opacity-70">· mock</span>
      ) : null}
    </span>
  );
}

export function ScenarioSelect({
  scenario,
  source,
  onChange,
}: {
  scenario: string | null;
  source: string | undefined;
  onChange: (scenario: MockScenario) => void;
}) {
  if (source !== "mock") return null;
  return (
    <Select
      value={(scenario ?? "normal") as MockScenario}
      onChange={onChange}
      ariaLabel="เลือกสถานการณ์จำลอง"
      icon={<IconSpark size={13} />}
      options={MOCK_SCENARIOS.map((item) => ({
        value: item.id,
        label: item.labelTh,
        hint: item.labelEn,
      }))}
    />
  );
}

export const THEMES = [
  { id: "graphite", th: "Graphite", en: "เทา" },
  { id: "nordic", th: "Paper", en: "ขาว" },
  { id: "frost", th: "Frost", en: "ฟ้า" },
  { id: "blueprint", th: "Blueprint", en: "กริด" },
] as const;

function subscribeTheme(callback: () => void) {
  window.addEventListener("sdl-theme", callback);
  return () => window.removeEventListener("sdl-theme", callback);
}

function themeSnapshot(): string {
  const value = document.documentElement.dataset.theme ?? "studio";
  return THEMES.some((theme) => theme.id === value) ? value : "studio";
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "studio");

  const change = (next: string) => {
    document.documentElement.dataset.theme = next;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("theme", next);
      window.history.replaceState(null, "", url);
      localStorage.setItem("sdl-theme", next);
    } catch {
      // private mode
    }
    window.dispatchEvent(new Event("sdl-theme"));
  };

  return (
    <Select
      value={theme}
      onChange={change}
      ariaLabel="เลือกธีม"
      icon={<IconPalette size={13} />}
      options={THEMES.map((item) => ({
        value: item.id,
        label: item.th,
        hint: item.en,
      }))}
    />
  );
}

const SEVERITY_LABEL: Record<Severity, string> = {
  alert: "วิกฤต",
  safe: "ปลอดภัย",
  ok: "กลับมาปกติ",
  info: "ข้อมูล",
};

export const STYLES = [
  { id: "editorial", label: "Print", hint: "แบน" },
  { id: "glass", label: "Glass", hint: "โปร่ง" },
  { id: "soft", label: "Soft", hint: "นุ่ม" },
  { id: "midnight", label: "Noir", hint: "ดำ" },
] as const;

function subscribeStyle(callback: () => void) {
  window.addEventListener("sdl-style", callback);
  return () => window.removeEventListener("sdl-style", callback);
}

function styleSnapshot(): string {
  const value = document.documentElement.dataset.style ?? "base";
  return STYLES.some((item) => item.id === value) ? value : "base";
}

export function StylePicker() {
  const style = useSyncExternalStore(subscribeStyle, styleSnapshot, () => "base");

  const change = (next: string) => {
    document.documentElement.dataset.style = next;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("style", next);
      window.history.replaceState(null, "", url);
      localStorage.setItem("sdl-style", next);
    } catch {
      // private mode
    }
    window.dispatchEvent(new Event("sdl-style"));
  };

  return (
    <Select
      value={style}
      onChange={change}
      ariaLabel="เลือกสไตล์หน้าจอ"
      icon={<IconSpark size={13} />}
      options={STYLES.map((item) => ({
        value: item.id,
        label: item.label,
        hint: item.hint,
      }))}
    />
  );
}

export function AlertBanner({
  alert,
  onClose,
}: {
  alert: Alert;
  onClose: () => void;
}) {
  const level = severity(alert.text);
  const style = SEVERITY_STYLE[level];
  const Icon = style.icon;

  return (
    <div
      className={`alert-banner fade-up`}
      data-tone={level}
      role="status"
      aria-live="polite"
    >
      <span
        className={`alert-icon flex h-6 w-6 shrink-0 items-center justify-center ${style.text}`}
        style={{ background: "color-mix(in oklab, currentColor 12%, transparent)" }}
      >
        <Icon size={14} />
      </span>
      <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
        {alert.text}
      </p>
      <span className={`chip ${level === "alert" ? "chip-alert" : level === "safe" ? "chip-safe" : level === "ok" ? "chip-ok" : "chip-warn"}`}>
        {SEVERITY_LABEL[level]}
      </span>
      <span className="num shrink-0 text-[11.5px] text-muted">{formatClock(alert.at)}</span>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-muted transition-colors hover:text-ink"
        aria-label="ปิดแจ้งเตือน"
      >
        <IconX size={13} />
      </button>
    </div>
  );
}

function AlertRow({ alert, now }: { alert: Alert; now: number }) {
  const level = severity(alert.text);
  const style = SEVERITY_STYLE[level];
  const Icon = style.icon;
  const age = Math.max(0, Math.round((now - alert.at) / 1000));

  return (
    <li className="flex items-start gap-2 rounded-[9px] px-2 py-1.5 hover:bg-surface-2/60">
      <span className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center ${style.text}`}>
        <Icon size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[12.5px] leading-snug text-ink/90">
          {alert.text}
        </span>
        <span className="num mt-0.5 block text-[10px] text-muted">
          {formatClock(alert.at)} · {age < 60 ? `${age} วิ` : `${Math.floor(age / 60)} น.`}ที่แล้ว
        </span>
      </span>
    </li>
  );
}

export function AlertsPanel({
  alerts,
  now,
  className = "",
  compact = false,
  checks = [],
}: {
  alerts: Alert[];
  now: number;
  className?: string;
  compact?: boolean;
  checks?: { label: string; ok: boolean }[];
}) {
  const critical = alerts.filter((alert) => {
    const level = severity(alert.text);
    return level === "alert" || level === "safe";
  }).length;

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-2 px-3.5 pt-2 pb-1">
        <div>
          <h2 className="text-[14px] font-semibold leading-tight text-ink">แจ้งเตือน</h2>
          <p className="label mt-0.5">Alerts</p>
        </div>
        <span className={`chip ${critical > 0 ? "chip-alert" : alerts.length > 0 ? "chip-warn" : ""}`}>
          <IconBell size={11} />
          {alerts.length}
        </span>
      </div>
      <div
        className={`scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2 ${
          alerts.length > 2 ? "alert-fade" : ""
        }`}
      >
        {alerts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-0.5 px-3 py-2 text-center">
            <span className="relative mb-1 flex h-9 w-9 items-center justify-center rounded-full text-sage">
              <span className="absolute inset-0 rounded-full bg-sage/15 blur-md" aria-hidden="true" />
              <IconCheck size={18} />
            </span>
            <p className="text-[12px] font-medium text-ink/80">ยังไม่มีเหตุการณ์</p>
            <p className="text-[10.5px] text-muted">ระบบทำงานปกติ</p>
            <ul className="mt-2 flex w-full flex-col gap-2 text-left text-[10px] leading-snug text-muted">
              {compact ? null : checks.length > 0 ? (
                <li className="flex w-full flex-col gap-1 rounded-[8px] border border-line bg-surface-2/40 px-2 py-1.5">
                  {checks.map((check) => (
                    <span key={check.label} className="flex items-center gap-1.5">
                      <Dot tone={check.ok ? "ok" : "alert"} />
                      <span className={check.ok ? "text-muted" : "text-brick"}>
                        {check.label}
                      </span>
                    </span>
                  ))}
                </li>
              ) : null}
              {compact ? null : (
                <li className="short-hide flex flex-col gap-1">
                  <span>· เซนเซอร์หลุด / ปิดฉุกเฉิน → แจ้งทันที</span>
                  <span>· คลาวด์หลุด / กลับมา → บันทึกที่นี่</span>
                </li>
              )}
            </ul>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {alerts.slice(0, 20).map((alert) => (
              <AlertRow key={alert.id} alert={alert} now={now} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DockCell({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone,
}: {
  icon: typeof IconClock;
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: "ok" | "alert";
}) {
  const color = tone === "alert" ? "text-brick" : tone === "ok" ? "text-sage" : "text-ink";
  const iconColor =
    tone === "alert" ? "text-brick" : tone === "ok" ? "text-sage" : "text-muted/70";
  return (
    <div className="flex min-w-0 items-center gap-2 border-l border-line px-3 py-1.5 first:border-l-0">
      <span className={`shrink-0 ${iconColor}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="label truncate text-[10.5px]">{label}</p>
        <p className="flex items-baseline gap-1">
          <span className={`num text-[16px] font-semibold ${color}`}>{value}</span>
          {unit ? <span className="text-[10px] text-muted">{unit}</span> : null}
        </p>
        {hint ? <p className="truncate text-[10.5px] text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function MetricsDock({
  derived,
  state,
  onOpenRaw,
}: {
  derived: Derived;
  state: PublicState | null;
  onOpenRaw: () => void;
}) {
  const cells: {
    icon: typeof IconClock;
    label: string;
    value: string | number;
    unit?: string;
    hint?: string;
    tone?: "ok" | "alert";
  }[] = [
    {
      icon: IconClock,
      label: "Uptime",
      value: formatDuration(derived.uptimeS),
      hint: derived.reset ? `reset: ${derived.reset}` : "ตั้งแต่บูต",
    },
    {
      icon: IconCpu,
      label: "Heap",
      value: derived.heap ? Math.round(derived.heap / 1024) : "—",
      unit: "KB",
      hint: derived.heapMin ? `min ${Math.round(derived.heapMin / 1024)} KB` : undefined,
    },
    {
      icon: IconWifi,
      label: "RSSI",
      value: derived.rssi ?? "—",
      unit: "dBm",
      hint: state?.gateway?.ip ?? undefined,
    },
    {
      icon: IconActivity,
      label: "แพ็กเก็ต",
      value: formatPercent(derived.successRate, 1).replace("+", ""),
      tone:
        derived.successRate != null && derived.successRate < 95
          ? ("alert" as const)
          : ("ok" as const),
      hint: state?.sensors.health?.tx_attempts
        ? `${state.sensors.health.tx_acked}/${state.sensors.health.tx_attempts}`
        : state?.snapshot?.n1_seq
          ? `${state.snapshot.n1_rx}/${state.snapshot.n1_seq}`
          : undefined,
    },
    {
      icon: IconInbox,
      label: "Buffered",
      value: derived.buffered,
      unit: "รายการ",
      hint: "รอส่งขึ้นคลาวด์",
    },
    {
      icon: IconAlert,
      label: "Dropped",
      value: derived.dropped,
      unit: "รายการ",
      tone: derived.dropped > 0 ? ("alert" as const) : undefined,
      hint: derived.dropped > 0 ? "มีข้อมูลหาย" : "ไม่สูญหาย",
    },
    {
      icon: IconRadio,
      label: "โหนด N1",
      value: state?.snapshot?.n1_age_s ?? "—",
      unit: "วิ",
      hint: derived.nodeOnline ? "อายุแพ็กเก็ตล่าสุด" : "ไม่ได้รับข้อมูล",
    },
  ];

  return (
    <section className="card flex shrink-0 items-stretch overflow-hidden">
      <div className="hidden shrink-0 flex-col justify-center border-r border-line px-3 lg:flex">
        <p className="label text-[10.5px]">System</p>
        <p className="label text-[10.5px] opacity-50">health</p>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
        {cells.map((cell) => (
          <DockCell
            key={cell.label}
            icon={cell.icon}
            label={cell.label}
            value={cell.value}
            unit={cell.unit}
            hint={cell.hint}
            tone={cell.tone}
          />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-l border-line px-3">
        <span className={`chip ${state?.source === "mock" ? "chip-mock" : "chip-ok"}`}>
          <Dot tone={state?.source === "mock" ? "warn" : "ok"} pulse={false} />
          {state?.source === "mqtt" ? "MQTT" : "MOCK"}
        </span>
        <button
          type="button"
          onClick={onOpenRaw}
          className="btn h-8 shrink-0 gap-1.5 px-2.5 text-[11.5px]"
        >
          <IconCode size={12} /> RAW
        </button>
      </div>
    </section>
  );
}

const RAW_TABS = ["state", "gateway", "telemetry", "health", "presence"] as const;
type RawTab = (typeof RAW_TABS)[number];

export function RawSheet({
  state,
  onClose,
}: {
  state: PublicState | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<RawTab>("state");
  const payload =
    tab === "state"
      ? state?.snapshot
      : tab === "gateway"
        ? state?.gateway
        : tab === "telemetry"
          ? state?.sensors.telemetry
          : tab === "health"
            ? state?.sensors.health
            : state?.sensors.status;

  const telemetry = state?.sensors.telemetry;
  const colourCells = [
    { label: "Lux", value: telemetry?.lux, unit: "lx" },
    { label: "CCT", value: telemetry?.cct, unit: "K" },
    { label: "R", value: telemetry?.r },
    { label: "G", value: telemetry?.g },
    { label: "B", value: telemetry?.b },
    { label: "Clear", value: telemetry?.c },
  ];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="ข้อมูลดิบจาก MQTT"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div>
            <h2 className="text-[14px] font-semibold leading-tight text-ink">ข้อมูลดิบจาก MQTT</h2>
            <p className="label mt-0.5">Raw payload</p>
          </div>
          <div className="flex items-center gap-1">
            {RAW_TABS.map((item) => (
              <button
                key={item}
                type="button"
                data-active={tab === item}
                className="tab"
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
            <button
              type="button"
              className="icon-btn ml-1"
              onClick={onClose}
              aria-label="ปิดข้อมูลดิบ"
            >
              <IconX size={14} />
            </button>
          </div>
        </div>

        {tab === "telemetry" ? (
          <div className="grid grid-cols-3 gap-2 px-3 pt-1 sm:grid-cols-6">
            {colourCells.map((cell) => (
              <div key={cell.label} className="rounded-[9px] border border-line bg-surface-2/60 px-2 py-1.5">
                <p className="label text-[10px]">{cell.label}</p>
                <p className="num text-[13px] text-ink">
                  {cell.value ?? "—"}
                  {cell.unit && cell.value != null ? (
                    <span className="ml-0.5 text-[10px] text-muted">{cell.unit}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <pre className="scroll-thin m-3 mt-2 min-h-0 flex-1 overflow-auto rounded-[10px] border border-line bg-surface-2/60 p-3 text-[11.5px] leading-relaxed text-ink/90">
          {payload ? JSON.stringify(payload, null, 2) : "— ยังไม่มีข้อมูล —"}
        </pre>
      </div>
    </div>
  );
}
