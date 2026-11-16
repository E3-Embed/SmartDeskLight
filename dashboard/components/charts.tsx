"use client";

import { useId, useMemo } from "react";
import type { Derived } from "@/lib/derive";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/history";
import {
  clamp,
  formatClock,
  formatKelvin,
  formatLux,
  formatPercent,
} from "@/lib/format";
import type { Sample } from "@/lib/types";
import { SectionHead } from "./ui";

interface PanelProps {
  samples: Sample[];
  now: number;
  range: HistoryRange;
  onRange: (id: string) => void;
  derived: Derived;
  className?: string;
}

function stepPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x} ${points[i - 1].y} L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function cctColor(kelvin: number): string {
  const t = clamp((kelvin - 2500) / 4000, 0, 1);
  const from = [217, 160, 85];
  const to = [157, 180, 192];
  const rgb = from.map((value, index) => Math.round(value + (to[index] - value) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function RangeTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="ช่วงเวลากราฟ">
      {HISTORY_RANGES.map((range) => (
        <button
          key={range.id}
          type="button"
          role="tab"
          aria-selected={value === range.id}
          data-active={value === range.id}
          className="tab"
          onClick={() => onChange(range.id)}
        >
          {range.labelTh}
        </button>
      ))}
    </div>
  );
}

function Grid({
  yLabels,
  children,
}: {
  yLabels: { value: number; top: number; text: string }[];
  children: React.ReactNode;
}) {
  const hasAxis = yLabels.length > 0;
  return (
    <div className="relative h-full w-full">
      <div className={`absolute inset-y-0 left-0 ${hasAxis ? "w-10" : "w-0"}`}>
        {yLabels.map((label) => (
          <span
            key={label.value}
            className="num absolute right-2 -translate-y-1/2 text-[12px] text-muted"
            style={{ top: `${Math.min(93, Math.max(7, label.top))}%` }}
          >
            {label.text}
          </span>
        ))}
      </div>
      <div className={`absolute inset-y-0 right-0 ${hasAxis ? "left-10" : "left-0"}`}>
        {children}
      </div>
    </div>
  );
}

export function LuxPanel({
  samples,
  now,
  range,
  onRange,
  derived,
  className = "",
}: PanelProps) {
  const gradientId = useId().replace(/:/g, "");
  const peak = Math.max(400, ...samples.map((sample) => Math.max(sample.lux, sample.targetLux)));
  const domainMax =
    [400, 500, 600, 800, 1000, 1200].find((value) => value >= peak * 1.12) ??
    Math.ceil((peak * 1.12) / 200) * 200;

  const geometry = useMemo(() => {
    const start = now - range.ms;
    const visible = samples.filter((sample) => sample.t >= start - 1000);
    const toPoint = (value: number, t: number) => ({
      x: clamp(((t - start) / range.ms) * 100, 0, 100),
      y: 100 - clamp((value / domainMax) * 100, 0, 100),
    });
    const luxPoints = visible.map((sample) => toPoint(sample.lux, sample.t));
    const targetPoints = visible.map((sample) => toPoint(sample.targetLux, sample.t));
    const upper = visible.map((sample) => toPoint(sample.targetLux * 1.07, sample.t));
    const lower = visible.map((sample) => toPoint(sample.targetLux * 0.93, sample.t));

    const band =
      upper.length > 1
        ? `${linePath(upper)} L ${[...lower]
            .reverse()
            .map((point) => `${point.x} ${point.y}`)
            .join(" L ")} Z`
        : "";

    return {
      visible,
      lux: linePath(luxPoints),
      area:
        luxPoints.length > 1
          ? `${linePath(luxPoints)} L ${luxPoints[luxPoints.length - 1].x} 100 L ${luxPoints[0].x} 100 Z`
          : "",
      target: stepPath(targetPoints),
      band,
      last: luxPoints[luxPoints.length - 1],
    };
  }, [samples, now, range.ms, domainMax]);

  const yLabels = [1, 0].map((fraction) => ({
    value: fraction,
    top: (1 - fraction) * 100,
    text: Math.round(domainMax * fraction).toLocaleString("en-US"),
  }));

  return (
    <section className={`card flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
      <div className="flex flex-col gap-2 px-4 pt-3 pb-1">
        <SectionHead
          title="กราฟความสว่าง"
          en="Illuminance history · lux"
          right={<RangeTabs value={range.id} onChange={onRange} />}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="num text-[26px] font-medium leading-none text-ink">
              {formatLux(derived.lux)}
              <span className="ml-1 text-[13px] font-normal text-muted">lx</span>
            </span>
            <span className="text-[12.5px] text-muted">
              เป้า <span className="num text-ink">{formatLux(derived.targetLux)}</span> lx
            </span>
            <span
              className={`num text-[12.5px] ${
                derived.inTolerance ? "text-sage" : "text-amber-deep"
              }`}
            >
              {formatPercent(derived.errorPct)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4 rounded-full bg-amber" /> วัดจริง
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4 rounded-full border-t border-dashed border-muted" />{" "}
              เป้าหมาย
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-[3px] bg-amber-soft" /> ±7%
            </span>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 px-4 pb-1">
        <Grid yLabels={yLabels}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label="กราฟความสว่างเทียบเป้าหมาย"
          >
            <defs>
              <linearGradient id={`luxFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 25, 50, 75, 100].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="100"
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.55"
              />
            ))}
            {[25, 50, 75].map((x) => (
              <line
                key={`v${x}`}
                x1={x}
                y1="0"
                x2={x}
                y2="100"
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="2 7"
                vectorEffect="non-scaling-stroke"
                opacity="0.4"
              />
            ))}
            {[0, 25, 50, 75, 100].map((y) => (
              <line
                key={`t${y}`}
                x1="0"
                y1={y}
                x2="1.6"
                y2={y}
                stroke="var(--muted)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.55"
              />
            ))}

            {geometry.band ? (
              <path d={geometry.band} fill="var(--honey)" opacity="0.16" />
            ) : null}
            {geometry.area ? (
              <path d={geometry.area} fill={`url(#luxFill-${gradientId})`} />
            ) : null}
            {geometry.target ? (
              <path
                d={geometry.target}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.4"
                strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke"
                opacity="0.85"
              />
            ) : null}
            {geometry.lux ? (
              <path
                d={geometry.lux}
                fill="none"
                stroke="var(--amber)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {geometry.last ? (
            <span
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${geometry.last.x}%`, top: `${geometry.last.y}%` }}
              aria-hidden="true"
            >
              <span className="absolute -inset-2 rounded-full bg-honey/25 blur-[3px]" />
              <span className="relative block h-[7px] w-[7px] rounded-full bg-amber ring-2 ring-surface" />
            </span>
          ) : null}
        </Grid>
        {geometry.visible.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[12.5px] text-muted">กำลังรวบรวมข้อมูล…</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between px-4 pb-2 text-[11.5px] text-muted">
        <span className="num">{formatClock(now - range.ms)}</span>
        <span className="num">{formatClock(now - range.ms / 2)}</span>
        <span className="num">ตอนนี้</span>
      </div>
    </section>
  );
}

export function CctPanel({ samples, now, range, derived, className = "" }: PanelProps) {
  const start = now - range.ms;
  const visible = samples.filter((sample) => sample.t >= start - 1000);
  const values = visible.length > 0 ? visible.map((sample) => sample.cct) : [3000];
  const lo = Math.max(2000, Math.floor((Math.min(...values) - 250) / 500) * 500);
  const hi = Math.min(7000, Math.ceil((Math.max(...values) + 250) / 500) * 500);
  const min = lo;
  const max = Math.max(hi, lo + 1000);
  const toY = (kelvin: number) => 100 - clamp(((kelvin - min) / (max - min)) * 100, 0, 100);

  const segments: { d: string; color: string }[] = [];
  {
    const points = visible.map((sample) => ({
      x: clamp(((sample.t - start) / range.ms) * 100, 0, 100),
      y: toY(sample.cct),
      cct: sample.cct,
    }));
    if (points.length >= 2) {
      for (let i = 1; i < points.length; i += 1) {
        segments.push({
          d: `M ${points[i - 1].x} ${points[i - 1].y} L ${points[i].x} ${points[i].y}`,
          color: cctColor((points[i].cct + points[i - 1].cct) / 2),
        });
      }
    }
  }

  const targetPoints = visible.map((sample) => ({
    x: clamp(((sample.t - start) / range.ms) * 100, 0, 100),
    y: toY(sample.targetCct),
  }));

  const yLabels: { value: number; top: number; text: string }[] = [];

  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1">
        <div>
          <h2 className="text-[14px] font-semibold leading-tight text-ink">อุณหภูมิสี</h2>
          <p className="label mt-0.5">Colour temperature · K</p>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <span className="num text-ink">{formatKelvin(derived.cct)} K</span>
          <span className="text-muted">
            เป้า <span className="num text-ink">{formatKelvin(derived.targetCct)}</span> K
          </span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 px-4 pb-1.5">
        <Grid yLabels={yLabels}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label="กราฟอุณหภูมิสีเทียบเป้าหมาย"
          >
            {[0, 25, 50, 75, 100].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="100"
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.55"
              />
            ))}
            {[25, 50, 75].map((x) => (
              <line
                key={`v${x}`}
                x1={x}
                y1="0"
                x2={x}
                y2="100"
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="2 7"
                vectorEffect="non-scaling-stroke"
                opacity="0.35"
              />
            ))}
            {targetPoints.length > 1 ? (
              <path
                d={stepPath(targetPoints)}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
                opacity="0.8"
              />
            ) : null}
            {segments.map((segment, index) => (
              <path
                key={index}
                d={segment.d}
                fill="none"
                stroke={segment.color}
                strokeWidth="2.2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </Grid>
        {segments.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[12.5px] text-muted">กำลังรวบรวมข้อมูล…</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
