"use client";

import type { Mode } from "@/lib/types";
import {
  IconArrowDown,
  IconArrowUp,
  IconBook,
  IconCheck,
  IconCode,
  IconLock,
  IconPalette,
  SectionHead,
} from "./ui";

const MODES: {
  id: Mode;
  th: string;
  en: string;
  lux: number;
  k: number;
  icon: typeof IconBook;
}[] = [
  { id: "reading", th: "อ่านหนังสือ", en: "Reading", lux: 500, k: 4000, icon: IconBook },
  { id: "coding", th: "เขียนโค้ด", en: "Coding", lux: 300, k: 4500, icon: IconCode },
  { id: "drawing", th: "วาดรูป", en: "Drawing", lux: 700, k: 5000, icon: IconPalette },
];

export function ModePanel({
  mode,
  pending,
  onMode,
  horizontal = false,
}: {
  mode: Mode;
  pending: string | null;
  onMode: (mode: Mode) => void;
  horizontal?: boolean;
}) {
  if (horizontal) {
    return (
      <section className="card flex flex-1 flex-col px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold leading-tight text-ink">โหมดการทำงาน</h2>
          <span className="label">Activity</span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {MODES.map((item) => {
            const active = mode === item.id;
            const isPending = pending === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onMode(item.id)}
                disabled={isPending}
                aria-pressed={active}
                className={`btn flex-col items-start justify-center gap-0.5 whitespace-nowrap px-2.5 py-1.5 ${active ? "btn-active" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon size={14} />
                  <span className="whitespace-nowrap text-[12px] font-medium leading-tight">{item.th}</span>
                </span>
                <span className="num text-[10px] text-muted">
                  {isPending ? "กำลังส่ง…" : `${item.lux} lx · ${item.k.toLocaleString("en-US")} K`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="card card-pad">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13.5px] font-semibold leading-tight text-ink">โหมดการทำงาน</h2>
        <span className="label">Activity preset</span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {MODES.map((item) => {
          const active = mode === item.id;
          const isPending = pending === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onMode(item.id)}
              disabled={isPending}
              aria-pressed={active}
              className={`btn min-h-[40px] justify-between px-2.5 py-1 ${active ? "btn-active" : ""}`}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} />
                <span className="text-[13px] font-medium leading-tight">{item.th}</span>
                <span className="text-[10.5px] font-normal text-muted">{item.en}</span>
              </span>
              <span className="flex items-center gap-1.5">
                {isPending ? (
                  <span className="text-[10.5px] text-amber-deep">กำลังส่ง…</span>
                ) : (
                  <>
                    <span className="num text-[10.5px] text-muted">
                      {item.lux} lx · {item.k.toLocaleString("en-US")} K
                    </span>
                    {active ? <IconCheck size={13} className="text-amber-deep" /> : null}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function FeedbackPanel({
  onFeedback,
  cooldown,
  className = "",
}: {
  onFeedback: (value: "too_bright" | "too_dim") => void;
  cooldown: number;
  className?: string;
}) {
  return (
    <section className={`card card-pad ${className}`}>
      <SectionHead title="แสงไม่ถูกใจ?" en="Quick feedback" />
      <div className="mt-2 grid grid-cols-2 gap-2">        <button
          type="button"
          className="btn flex-col gap-0.5 py-1.5"
          onClick={() => onFeedback("too_bright")}
          disabled={cooldown > 0}
        >
          <IconArrowUp size={15} />
          <span className="text-[13.5px]">สว่างเกินไป</span>
          <span className="text-[11px] font-normal text-muted">เป้า −15%</span>
        </button>
        <button
          type="button"
          className="btn flex-col gap-0.5 py-1.5"
          onClick={() => onFeedback("too_dim")}
          disabled={cooldown > 0}
        >
          <IconArrowDown size={15} />
          <span className="text-[13.5px]">มืดเกินไป</span>
          <span className="text-[11px] font-normal text-muted">เป้า +15%</span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {cooldown > 0 ? `รออีก ${cooldown} วินาที` : ""}
      </span>
    </section>
  );
}

export function SafeNote() {
  return (
    <section className="card flex items-center gap-3 px-4 py-2">
      <span className="text-muted">
        <IconLock size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink">หยุดฉุกเฉิน / ปิดไฟ</p>
        <p className="truncate text-[10.5px] text-muted">
          ต้องกดปุ่มที่ตัวโคม — เฟิร์มแวร์ยังไม่รับคำสั่งนี้
        </p>
      </div>
      <button
        type="button"
        className="icon-btn"
        disabled
        title="รอคำสั่งฝั่ง firmware — กดปุ่มที่ตัวโคมแทน"
        aria-label="Safe mode ยังไม่พร้อมใช้งาน"
      >
        <IconLock size={13} />
      </button>
    </section>
  );
}
