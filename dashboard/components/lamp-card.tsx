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

const PRESENCE_SOURCE_LABEL: Record<NonNullable<Derived["presenceSource"]>, string> = {
  pir: "PIR",
  tof: "ToF",
  "pir+tof": "PIR + ToF",
  none: "—",
};


function polar(cx: number, cy: number, radius: number, deg: number) {
  const angle = ((deg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
}

function LabGauge({ lux, target }: { lux: number | null; target: number }) {
  const size = 172;
  const c = size / 2;
  const r = 62;
  const circumference = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(lux ?? 0, 800));
  const fraction = value / 800;
  const targetDeg = (Math.max(0, Math.min(target, 800)) / 800) * 360;
  const [tx1, ty1] = polar(c, c, r - 11, targetDeg);
  const [tx2, ty2] = polar(c, c, r + 9, targetDeg);

  return (
    <div className="relative lab-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth="1" />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="4"
          strokeLinecap="butt"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          transform={`rotate(-90 ${c} ${c})`}
          opacity="0.9"
        />
        {Array.from({ length: 41 }, (_, i) => {
          const deg = (i / 40) * 360;
          const major = i % 5 === 0;
          const [x1, y1] = polar(c, c, r + (major ? 7 : 4), deg);
          const [x2, y2] = polar(c, c, r + 11, deg);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--muted)"
              strokeWidth={major ? 1.2 : 0.7}
              opacity={major ? 0.7 : 0.4}
            />
          );
        })}
        <line
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          stroke="var(--brick)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[36px] font-semibold leading-none">
          {lux == null ? "—" : formatLux(lux)}
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted">lux</span>
      </div>
    </div>
  );
}

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
    return <div className="error-empty" />;
  }
  const position = clamp(50 + (errorPct / 30) * 50, 0, 100);
  return (
    <div className="error-bar">
      <div className="error-scale">
        <span className="error-track" />
        <span className="error-band" style={{ left: "38.33%", width: "23.34%" }} />
        <span className="error-target" />
        <span className="error-mark" style={{ left: `${position}%` }} />
      </div>
      <div className="error-labels">
        <span className="num">−30%</span>
        <span>เป้า · ±7%</span>
        <span className="num">+30%</span>
      </div>
    </div>
  );
}

export function LampStrip({
  derived,
  now,
}: {
  derived: Derived;
  now: number;
}) {
  return (
    <section className="card flex min-h-0 min-w-0 flex-1 items-stretch gap-4 px-4 py-2.5">
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="label">ความสว่างบนโต๊ะ</span>
          <StateChip state={derived.state} />
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className="font-display text-[clamp(40px,6.4vh,62px)] font-semibold leading-[0.9]">
            {formatLux(derived.lux)}
          </span>
          <span className="mb-1 text-[12px] text-muted">lx</span>
          <span
            className={`num mb-1 text-[12px] ${derived.inTolerance ? "text-sage" : "text-amber-deep"}`}
          >
            {formatPercent(derived.errorPct)}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">
          เป้า <span className="num text-ink">{formatLux(derived.targetLux)}</span> lx ·{" "}
          {formatAgo(derived.lastSeenAt, now)}
        </p>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 content-center gap-x-4 gap-y-2 border-line pl-4 xl:border-l">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="label">PWM</span>
            <span className="num text-[11.5px]">{Math.round(derived.pwm)}/255</span>
          </div>
          <div className="mt-1 bar">
            <span style={{ width: `${derived.pwmPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="label">กำลังไฟ</span>
            <span className="num text-[11.5px]">{formatWatts(derived.powerMw)} W</span>
          </div>
          <div className="mt-1 bar">
            <span
              style={{ width: `${clamp(((derived.powerMw ?? 0) / 5000) * 100, 0, 100)}%` }}
            />
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-1.5">
          {FILTERS.map((filter, index) => {
            const active = derived.filters[index];
            return (
              <span
                key={filter.key}
                className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-[10.5px] ${
                  active ? "border-amber/50 bg-amber-soft text-amber-deep" : "border-line text-muted"
                }`}
              >
                <Dot tone={active ? "warn" : "idle"} />
                {filter.en}
              </span>
            );
          })}
          <span className="ml-auto flex items-center gap-1.5 text-[10.5px]">
            <Dot tone={derived.presence ? "ok" : "idle"} pulse={derived.presence} />
            <span className="text-ink">{derived.presence ? "มีคน" : "ไม่มีคน"}</span>
            <span className="text-muted">{derived.distanceMm ? `${derived.distanceMm} mm` : "—"}</span>
          </span>
        </div>
      </div>
    </section>
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
              {derived.tofOk === false || derived.inaOk === false ? (
                <span className="chip chip-alert">
                  <IconAlert size={10} /> Sensor
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
          <div className="hero-variant hero-base relative flex items-end gap-2">
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

          <div className="hero-variant hero-editorial">
            <div className="flex items-end gap-2">
              <span className="editorial-value">{formatLux(derived.lux)}</span>
              <span className="mb-2 text-[13px] text-muted">lx</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line/70 pt-2 text-[12px]">
              <span className="text-muted">
                เป้า <span className="num text-ink">{formatLux(derived.targetLux)}</span> lx
              </span>
              <span
                className={`num ${derived.inTolerance ? "text-sage" : "text-amber-deep"}`}
              >
                {formatPercent(derived.errorPct)}
              </span>
            </div>
          </div>

          <div className="hero-variant hero-lab flex flex-col items-center gap-2">
            <LabGauge lux={derived.lux} target={derived.targetLux} />
            <div className="lab-target flex flex-wrap items-baseline justify-center gap-x-3 text-[12px]">
              <span className="text-muted">
                เป้า <span className="num text-ink">{formatLux(derived.targetLux)}</span> lx
              </span>
              <span
                className={`num ${derived.inTolerance ? "text-sage" : "text-amber-deep"}`}
              >
                {formatPercent(derived.errorPct)}
              </span>
            </div>
          </div>

          <div className="hero-variant hero-base mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
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

        <div className="error-bar">
          <ErrorBar errorPct={derived.errorPct} />
        </div>

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
              {derived.distanceMm ? `${derived.distanceMm} mm` : "—"} ·{" "}
              {derived.presenceSource
                ? PRESENCE_SOURCE_LABEL[derived.presenceSource]
                : "PIR"}
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
          node N1 ·{" "}
          {state?.sensors.telemetry?.seq != null
            ? `seq ${state.sensors.telemetry.seq}`
            : "seq —"}
        </span>
        <span className="truncate">
          lamp {formatChip(derived.powerMw)} · {derived.mode}
          {derived.energyWh != null ? ` · ${derived.energyWh.toFixed(2)} Wh` : ""}
        </span>
      </div>
    </section>
  );
}
