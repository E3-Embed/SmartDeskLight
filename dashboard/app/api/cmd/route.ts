import { mockCommand } from "@/lib/mock";
import { ensureSource, sourceKind } from "@/lib/source";
import { publishCmd } from "@/lib/source/mqtt";
import { netpiePublish } from "@/lib/source/netpie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = ["reading", "coding", "drawing"] as const;
const FEEDBACK = ["too_bright", "too_dim"] as const;

type Mode = (typeof MODES)[number];
type Feedback = (typeof FEEDBACK)[number];

interface CommandGlobal {
  __sdlLastCommandAt?: Map<string, number>;
}

const globalRef = globalThis as unknown as CommandGlobal;
const lastCommandAt = (globalRef.__sdlLastCommandAt ??= new Map());

const COOLDOWN_MS = 700;
const MAX_BODY_BYTES = 512;

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}

export async function POST(request: Request) {
  ensureSource();

  const key = clientKey(request);
  const now = Date.now();
  const previous = lastCommandAt.get(key) ?? 0;
  if (now - previous < COOLDOWN_MS) {
    return Response.json(
      { ok: false, error: "กดถี่เกินไป รอสักครู่แล้วลองใหม่" },
      { status: 429 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload ใหญ่เกินไป" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "payload ต้องเป็น JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ ok: false, error: "payload ไม่ถูกต้อง" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const mode = typeof record.mode === "string" ? record.mode : undefined;
  const feedback = typeof record.feedback === "string" ? record.feedback : undefined;

  const validMode = mode && MODES.includes(mode as Mode) ? (mode as Mode) : null;
  const validFeedback =
    feedback && FEEDBACK.includes(feedback as Feedback) ? (feedback as Feedback) : null;

  if (!validMode && !validFeedback) {
    return Response.json(
      { ok: false, error: "รองรับเฉพาะ mode หรือ feedback ที่กำหนดไว้" },
      { status: 400 },
    );
  }

  lastCommandAt.set(key, now);

  const command: { mode?: Mode; feedback?: Feedback } = {};
  if (validMode) command.mode = validMode;
  if (validFeedback) command.feedback = validFeedback;

  if (sourceKind() === "mock") {
    mockCommand(command);
    return Response.json({ ok: true, simulated: true, command, at: now });
  }

  if (sourceKind() === "netpie") {
    const result = await netpiePublish(command as Record<string, string>);
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error ?? "ส่งคำสั่งไป NETPIE ไม่สำเร็จ" },
        { status: 503 },
      );
    }
    return Response.json({ ok: true, simulated: false, via: "netpie", command, at: now });
  }

  const published = publishCmd(
    command as Record<string, string>,
  );
  if (!published) {
    return Response.json(
      { ok: false, error: "broker ยังไม่เชื่อมต่อ ลองใหม่อีกครั้ง" },
      { status: 503 },
    );
  }
  return Response.json({ ok: true, simulated: false, command, at: now });
}
