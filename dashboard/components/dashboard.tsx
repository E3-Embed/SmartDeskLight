"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { derive } from "@/lib/derive";
import { formatClock } from "@/lib/format";
import { rangeById } from "@/lib/history";
import type { Mode, MockScenario, PublicState, Sample } from "@/lib/types";
import { CctPanel, LuxPanel } from "./charts";
import { FeedbackPanel, ModePanel, SafeNote } from "./controls";
import { LampCard, LampStrip } from "./lamp-card";
import {
  AlertBanner,
  AlertsPanel,
  ConnectionBadge,
  MetricsDock,
  RawSheet,
  ScenarioSelect,
  severity,
  StylePicker,
  ThemePicker,
} from "./system";
import { CornersToggle, IconAlert, IconCheck, IconGrid, Select } from "./ui";
import { BrandLogo } from "./logo";

const EMPTY_STATE: PublicState = {
  source: "mock",
  link: "connecting",
  linkError: null,
  status: null,
  statusAt: null,
  snapshot: null,
  snapshotAt: null,
  gateway: null,
  gatewayAt: null,
  sensors: {
    status: null,
    statusAt: null,
    telemetry: null,
    telemetryAt: null,
    health: null,
    healthAt: null,
  },
  alerts: [],
  mockScenario: null,
  serverTime: 0,
};

const PENDING_TIMEOUT_MS = 15_000;
const FEEDBACK_COOLDOWN_MS = 5_000;
const BANNER_MS = 20_000;

type LayoutId = "a" | "b";

const LAYOUTS: { id: LayoutId; label: string; hint: string }[] = [
  { id: "a", label: "Operator", hint: "3 คอลัมน์" },
  { id: "b", label: "Focus", hint: "2 คอลัมน์" },
];

function subscribeLayout(callback: () => void) {
  window.addEventListener("sdl-layout", callback);
  return () => window.removeEventListener("sdl-layout", callback);
}

function layoutSnapshot(): LayoutId {
  try {
    const query = new URLSearchParams(window.location.search).get("layout");
    const value = query ?? localStorage.getItem("sdl-layout") ?? "a";
    return value === "a" || value === "b" ? value : "a";
  } catch {
    return "a";
  }
}

function LayoutPicker({
  layout,
  onChange,
}: {
  layout: LayoutId;
  onChange: (layout: LayoutId) => void;
}) {
  return (
    <Select
      value={layout}
      onChange={onChange}
      ariaLabel="เลือกรูปแบบหน้าจอ"
      icon={<IconGrid size={13} />}
      options={LAYOUTS.map((item) => ({
        value: item.id,
        label: item.label,
        hint: item.hint,
      }))}
    />
  );
}

function appendSample(previous: Sample[], sample: Sample): Sample[] {
  const last = previous[previous.length - 1];
  if (last && sample.t - last.t < 900) {
    return [...previous.slice(0, -1), sample];
  }
  const next = [...previous, sample];
  return next.length > 7200 ? next.slice(-7200) : next;
}

export function Dashboard() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const layout = useSyncExternalStore(subscribeLayout, layoutSnapshot, () => "a" as const);

  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<PublicState | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [live, setLive] = useState<"connecting" | "open" | "closed">("connecting");
  const [rangeId, setRangeId] = useState("5m");
  const [history, setHistory] = useState<Sample[] | null>(null);
  const [historySource, setHistorySource] = useState<string | null>(null);
  const [pending, setPending] = useState<{ value: Mode; at: number } | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "alert" } | null>(null);
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const source = new EventSource("/api/stream");

    source.onopen = () => setLive("open");

    source.addEventListener("init", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as {
          state: PublicState;
          samples: Sample[];
        };
        setState(data.state);
        setSamples(data.samples ?? []);
        setLive("open");
      } catch {
        setLive("closed");
      }
    });

    source.addEventListener("update", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as {
          state: PublicState;
          sample: Sample | null;
        };
        setState(data.state);
        if (data.sample) {
          setSamples((previous) => appendSample(previous, data.sample as Sample));
        }
      } catch {
        // ignore a malformed frame
      }
    });

    source.onerror = () => setLive("closed");

    return () => source.close();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/history?range=${rangeId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { samples: Sample[]; source?: string };
        if (!cancelled) {
          setHistory(data.samples);
          setHistorySource(data.source ?? null);
        }
      } catch {
        // live ring buffer stays the fallback
      }
    };

    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mounted, rangeId]);

  const derived = useMemo(() => derive(state ?? EMPTY_STATE, now), [state, now]);

  const chartSamples = useMemo(() => {
    // 5 min merges the Postgres tail with the live buffer too, so a new tab
    // (or a moment while the node is silent) still shows the last readings.
    const base = history ?? [];
    const lastBase = base.length > 0 ? base[base.length - 1].t : 0;
    const merged = [...base, ...samples.filter((sample) => sample.t > lastBase)];
    return rangeId === "5m" ? merged.slice(-360) : merged;
  }, [samples, history, rangeId]);

  const range = rangeById(rangeId);
  const latestAlert = state?.alerts[0] ?? null;
  const criticalAlert =
    latestAlert != null && ["alert", "safe"].includes(severity(latestAlert.text));

  useEffect(() => {
    if (!latestAlert || criticalAlert) return;
    const timer = setTimeout(() => setDismissedAlert(latestAlert.id), BANNER_MS);
    return () => clearTimeout(timer);
  }, [latestAlert, criticalAlert]);

  useEffect(() => {
    if (!pending) return;
    if (derived.mode !== pending.value) return;
    const timer = setTimeout(() => {
      setPending(null);
      setToast({ text: "เกตเวย์ยืนยันโหมดใหม่แล้ว", tone: "ok" });
    }, 350);
    return () => clearTimeout(timer);
  }, [derived.mode, pending]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setPending(null);
      setToast({ text: "ไม่ได้รับการยืนยันจากเกตเวย์ภายใน 15 วิ", tone: "alert" });
    }, PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const sendCommand = useCallback(async (payload: Record<string, string>) => {
    try {
      const response = await fetch("/api/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setToast({ text: data.error ?? "ส่งคำสั่งไม่สำเร็จ", tone: "alert" });
        return false;
      }
      return true;
    } catch {
      setToast({ text: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", tone: "alert" });
      return false;
    }
  }, []);

  const handleMode = useCallback(
    async (mode: Mode) => {
      setPending({ value: mode, at: Date.now() });
      const sent = await sendCommand({ mode });
      if (!sent) setPending(null);
    },
    [sendCommand],
  );

  const handleFeedback = useCallback(
    async (feedback: "too_bright" | "too_dim") => {
      const sent = await sendCommand({ feedback });
      setCooldownUntil(Date.now() + (sent ? FEEDBACK_COOLDOWN_MS : 2000));
      if (sent) {
        setToast({
          text:
            feedback === "too_bright"
              ? "ส่งแล้ว · เป้าความสว่างจะลดลง 15%"
              : "ส่งแล้ว · เป้าความสว่างจะเพิ่มขึ้น 15%",
          tone: "ok",
        });
      }
    },
    [sendCommand],
  );

  const handleScenario = useCallback(async (scenario: MockScenario) => {
    try {
      await fetch("/api/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
    } catch {
      setToast({ text: "สลับ scenario ไม่สำเร็จ", tone: "alert" });
    }
  }, []);

  const changeLayout = useCallback((next: LayoutId) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("layout", next);
      window.history.replaceState(null, "", url);
      localStorage.setItem("sdl-layout", next);
    } catch {
      // private mode
    }
    window.dispatchEvent(new Event("sdl-layout"));
  }, []);

  if (!mounted) {
    return <div className="min-h-[100dvh]" aria-busy="true" />;
  }

  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const showBanner = latestAlert != null && latestAlert.id !== dismissedAlert;

  const lamp = <LampCard derived={derived} state={state} samples={samples} now={now} />;
  const charts = (
    <>
      <LuxPanel
        samples={chartSamples}
        now={now}
        range={range}
        onRange={setRangeId}
        derived={derived}
        historySource={historySource}
        className="flex-[3]"
      />
      <CctPanel
        samples={chartSamples}
        now={now}
        range={range}
        onRange={setRangeId}
        derived={derived}
        className="flex-[2]"
      />
    </>
  );
  const mode = (
    <ModePanel mode={derived.mode} pending={pending?.value ?? null} onMode={handleMode} />
  );
  const feedback = <FeedbackPanel onFeedback={handleFeedback} cooldown={cooldown} />;
  const safe = <SafeNote />;
  const healthChecks = [
    {
      label: "โหนด N1 ส่งข้อมูลปกติ",
      ok: derived.nodeOnline && (state?.snapshot?.n1_age_s ?? 0) <= 10,
    },
    {
      label: "เชื่อมต่อคลาวด์อยู่",
      ok: state?.link === "online" && state?.status !== "offline",
    },
    { label: "ไม่ได้อยู่ในโหมดปลอดภัย", ok: !derived.safe },
  ];

  const alerts = (className: string, compact = false) => (
    <AlertsPanel
      alerts={state?.alerts ?? []}
      now={now}
      className={className}
      compact={compact}
      checks={healthChecks}
    />
  );

  return (
    <div className="flex min-h-[100dvh] flex-col xl:h-[100dvh] xl:overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ConnectionBadge state={state} live={live} />
          <ScenarioSelect
            scenario={state?.mockScenario ?? null}
            source={state?.source}
            onChange={handleScenario}
          />
          <LayoutPicker layout={layout} onChange={changeLayout} />
          <ThemePicker />
          <StylePicker />
          <CornersToggle />
          <span className="num hidden text-[11.5px] text-muted xl:inline">
            {new Date(now).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </span>
          <span className="num hidden text-[12px] text-muted sm:inline">{formatClock(now)}</span>
        </div>
      </header>

      {showBanner && latestAlert ? (
        <AlertBanner alert={latestAlert} onClose={() => setDismissedAlert(latestAlert.id)} />
      ) : null}

      <main className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-2 px-3 pb-2 pt-0.5">
        {layout === "a" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[minmax(300px,330px)_minmax(0,1fr)_minmax(300px,330px)]">
            {lamp}
            <div className="flex min-h-0 min-w-0 flex-col gap-2">{charts}</div>
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              {mode}
              {feedback}
              {alerts("min-h-[150px] flex-1")}
              {safe}
            </div>
          </div>
        ) : null}

        {layout === "b" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[minmax(320px,370px)_minmax(0,1fr)]">
            {lamp}
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <div className="flex min-h-0 flex-1 flex-col gap-2">{charts}</div>
              <div className="flex shrink-0 gap-2">
                <ModePanel
                  horizontal
                  mode={derived.mode}
                  pending={pending?.value ?? null}
                  onMode={handleMode}
                />
                <FeedbackPanel
                  className="w-[248px] shrink-0"
                  onFeedback={handleFeedback}
                  cooldown={cooldown}
                />
              </div>
              {alerts("h-[104px] shrink-0", true)}
              <div className="short-hide">{safe}</div>
            </div>
          </div>
        ) : null}

        <MetricsDock derived={derived} state={state} onOpenRaw={() => setRawOpen(true)} />
      </main>

      {rawOpen ? <RawSheet state={state} onClose={() => setRawOpen(false)} /> : null}

      {toast ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50">
          <div
            className={`fade-up flex items-center gap-2 rounded-[12px] border px-3.5 py-2.5 text-[12.5px] shadow-lg ${
              toast.tone === "ok"
                ? "border-sage/40 bg-sage-soft text-sage"
                : "border-brick/40 bg-brick-soft text-brick"
            }`}
            role="status"
          >
            {toast.tone === "ok" ? <IconCheck size={13} /> : <IconAlert size={13} />}
            {toast.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
