import { MOCK_SCENARIOS, type MockScenario } from "@/lib/types";
import { mockScenario, setMockScenario } from "@/lib/mock";
import { ensureSource, sourceKind } from "@/lib/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureSource();
  return Response.json({
    source: sourceKind(),
    scenario: mockScenario(),
    scenarios: MOCK_SCENARIOS,
  });
}

export async function POST(request: Request) {
  ensureSource();

  if (sourceKind() !== "mock") {
    return Response.json(
      { ok: false, error: "สลับ scenario ได้เฉพาะโหมด mock" },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "payload ต้องเป็น JSON" }, { status: 400 });
  }

  const scenario =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).scenario
      : null;

  const valid = MOCK_SCENARIOS.some((item) => item.id === scenario);
  if (!valid) {
    return Response.json({ ok: false, error: "ไม่รู้จัก scenario นี้" }, { status: 400 });
  }

  setMockScenario(scenario as MockScenario);
  return Response.json({ ok: true, scenario });
}
