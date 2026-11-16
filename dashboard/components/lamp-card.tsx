"use client";

import type { Derived } from "@/lib/derive";
import {
  clamp,
  formatAgo,
  formatChip,
  formatDuration,
  formatLux,
  formatPercent,
  formatWatts,
} from "@/lib/format";
import type { PublicState, Sample } from "@/lib/types";
import {
  Dot,
  IconAlert,
  IconCheck,
  IconLock,
  IconSpark,
  IconUser,
  StateChip,
} from "./ui";

const FILTERS = [
  { key: "diffuser", th: "กระจายแสง", en: "Diffuser" },
  { key: "nd", th: "ลดแสง", en: "ND" },
  { key: "warm", th: "อุ่นสี", en: "Warm" },
] as const;


function MiniTrend({ samples }: { samples: Sample[] }) {
  const recent = samples.slice(-90);
  if (recent.length < 2) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-line">
        <span className="text-[11px] text-muted">รวบรวมข้อมูล 90 วินาที…</span>
      </div>
    );
  }

  const values = recent.map((sample) => sample.lux);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(2, (max - min) * 0.2);
  const lo = min - pad;
  const span = max + pad - lo || 1;
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * 100,
    y: 100 - ((value - lo) / span) * 100,
  }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${line} L 100 100 L 0 100 Z`;

  return (
    <div className="flex min-h-[54px] flex-1 flex-col">
      <div className="flex items-baseline justify-between">
        <span className="label">90 วินาทีล่าสุด</span>
        <span className="num text-[10.5px] text-muted">
          {Math.round(min)}–{Math.round(max)} lx
        </span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-1 min-h-0 w-full flex-1"
        aria-hidden="true"
      >
        <path d={area} fill="var(--amber)" opacity="0.1" />
        <path
          d={line}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function ErrorBar({ errorPct }: { errorPct: number | null }) {
  if (errorPct == null) {
    return <div className="h-[26px] rounded-[6px] bg-surface-2/50" />;
  }
  const position = clamp(50 + (errorPct / 30) * 50, 0, 100);
  return (
    <div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-[6px] h-1.5 rounded-full border border-line bg-surface-2" />
        <div
          className="absolute top-[6px] h-1.5 rounded-[3px] bg-amber-soft"
          style={{ left: "38.33%", width: "23.34%" }}
        />
        <div className="absolute top-[3px] h-3 w-[1.5px] bg-ink/25" style={{ left: "50%" }} />
        <div
          className="absolute top-[1px] h-4 w-[3px] -translate-x-1/2 rounded-full bg-amber transition-[left] duration-700"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted">
        <span className="num">−30%</span>
        <span>เป้า · ±7%</span>
        <span className="num">+30%</span>
      </div>
    </div>
  );
}

export function LampCard({
  derived,
  state,
  samples,
  now,
}: {
  derived: Derived;
  state: PublicState | null;
  samples: Sample[];
  now: number;
}) {
  const glowOpacity = 0.1 + (derived.pwm / 255) * 0.5;
  const washOpacity = derived.state === "offline" ? 0.05 : 0.22 + (derived.pwm / 255) * 0.4;
  const seenText = formatAgo(derived.lastSeenAt, now);


  return (
    <section className="card relative flex min-h-0 flex-col overflow-hidden">
      <div
        className="glow"
        style={{ opacity: derived.state === "offline" ? 0.04 : glowOpacity }}
      />
      <div className="light-wash" style={{ opacity: washOpacity }} aria-hidden="true" />
      <div className="lamp-top-line" aria-hidden="true" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="label">ความสว่างบนโต๊ะ</p>
            <p className="mt-0.5 text-[11px] text-muted">Desk illuminance</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StateChip state={derived.state} />
            <div className="flex gap-1">
              {derived.ai ? (
                <span className="chip chip-warn">
                  <IconSpark size={10} /> AI
                </span>
              ) : (
                <span className="chip">กฎสำรอง</span>
              )}
              {derived.safe ? (
                <span className="chip chip-safe">
                  <IconLock size={10} /> Safe
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            className="hero-glow"
            aria-hidden="true"
            style={{
              opacity:
                derived.state === "offline" ? 0.1 : 0.28 + (derived.pwm / 255) * 0.45,
            }}
          />
          <div className="relative flex items-end gap-2">
              {derived.lux == null ? (
                <span className="font-display text-[46px] leading-[1.1] text-muted">—</span>
              ) : (
                <span
                  className={`font-display text-[clamp(54px,8vh,84px)] font-semibold leading-[0.9] tracking-[-0.03em] ${
                    derived.state === "offline" || derived.state === "stale" ? "opacity-60" : ""
                  }`}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatLux(derived.lux)}
                </span>
              )}
            <span className="mb-1 text-[14px] text-muted">lx</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
            <span className="text-muted">
              เป้า <span className="num text-ink">{formatLux(derived.targetLux)}</span> lx
            </span>
            <span
              className={`num inline-flex items-center gap-1 ${derived.inTolerance ? "text-sage" : "text-amber-deep"}`}
            >
              {derived.inTolerance ? <IconCheck size={11} /> : <IconAlert size={11} />}
              {formatPercent(derived.errorPct)}
            </span>
          </div>
        </div>

        <ErrorBar errorPct={derived.errorPct} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="label">PWM</span>
              <span className="num text-[12.5px] text-ink">
                {Math.round(derived.pwm)}
                <span className="text-muted">/255</span>
              </span>
            </div>
            <div className="mt-1 bar">
              <span style={{ width: `${derived.pwmPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="label">กำลังไฟ</span>
              <span className="num text-[12.5px] text-ink">
                {formatWatts(derived.powerMw)}
                <span className="text-muted"> W</span>
              </span>
            </div>
            <div className="mt-1 bar">
              <span
                style={{ width: `${clamp(((derived.powerMw ?? 0) / 5000) * 100, 0, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-muted">
          <span>{derived.safe ? "โหมดปลอดภัย · ระดับกลาง" : "ปรับละเอียดด้วย PID"}</span>
          <span className="num">
            {derived.voltage ? `${derived.voltage.toFixed(2)} V` : "—"} ·{" "}
            {derived.currentMa ? `${Math.round(derived.currentMa)} mA` : "—"}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label">ฟิลเตอร์</span>
            <span className="text-[10px] text-muted">Filter path</span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {FILTERS.map((filter, index) => {
              const active = derived.filters[index];
              return (
                <div
                  key={filter.key}
                  className={`rounded-[9px] border px-2 py-1.5 transition-colors ${
                    active ? "border-amber/50 bg-amber-soft" : "border-line bg-surface-2/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Dot tone={active ? "warn" : "idle"} />
                    <span
                      className={`text-[12px] font-medium ${active ? "text-amber-deep" : "text-muted"}`}
                    >
                      {filter.en}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted">{filter.th}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-[9px] border border-line bg-surface-2/50 px-2.5 py-1.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              derived.presence ? "bg-sage-soft text-sage" : "bg-surface text-muted"
            }`}
          >
            <IconUser size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-ink">
              {derived.presence ? "มีคนที่โต๊ะ" : "ไม่มีคนที่โต๊ะ"}
            </p>
            <p className="num text-[11px] text-muted">
              {derived.distanceMm ? `${derived.distanceMm} mm` : "—"} · PIR
            </p>
          </div>
          <span className={`chip ${derived.presence ? "chip-ok" : ""}`}>
            <Dot tone={derived.presence ? "ok" : "idle"} pulse={derived.presence} />
            {derived.presence ? "Present" : "Away"}
          </span>
        </div>

        <MiniTrend samples={samples} />

        <div className="flex items-center justify-between text-[10.5px] text-muted">
          <span>อัปเดต {seenText}</span>
          <span className="num">
            {formatDuration(derived.uptimeS)} · buf {derived.buffered}
          </span>
        </div>
      </div>

      <div className="relative flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-1.5 text-[10.5px] text-muted">
        <span className="truncate">
          node N1 · {state?.telemetry?.seq != null ? `seq ${state.telemetry.seq}` : "seq —"}
        </span>
        <span className="truncate">
          lamp {formatChip(derived.powerMw)} · {derived.mode}
        </span>
      </div>
    </section>
  );
}
