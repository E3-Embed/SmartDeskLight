// Quick broker probe: node --env-file-if-exists=.env.local scripts/probe.mjs
// Connects with the dashboard credentials, subscribes to `@msg/sdl/#`, and
// reports which topics answered. Never prints the password.
import mqtt from "mqtt";

const url = process.env.MQTT_URL ?? "mqtts://85.211.247.199.nip.io:8883";
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;
const clientId = process.env.MQTT_CLIENT_ID ?? "sdl-probe";
const prefix = process.env.MQTT_TOPIC_PREFIX ?? "@msg/sdl";
const nodeId = process.env.SDL_NODE_ID ?? "N1";
const waitMs = Number(process.env.PROBE_MS ?? 12_000);

if (!username || !password) {
  console.error(
    [
      "ยังไม่มี credential — เตรียม .env.local ก่อน:",
      "  cp .env.example .env.local",
      "  MQTT_USERNAME=dashboard",
      "  MQTT_PASSWORD=<รหัสจาก EMQX>",
      "",
      "จากนั้นรัน: pnpm probe",
    ].join("\n"),
  );
  process.exit(1);
}

const expected = [
  `${prefix}/gw/status`,
  `${prefix}/sensor/status`,
  `${prefix}/gw/telemetry`,
  `${prefix}/sensor/telemetry`,
  `${prefix}/sensor/health`,
  `${prefix}/gw/state`,
];

const seen = new Map();

const client = mqtt.connect(url, {
  clientId,
  username,
  password,
  keepalive: 20,
  clean: true,
  reconnectPeriod: 0,
  connectTimeout: 8000,
  rejectUnauthorized: process.env.MQTT_TLS_INSECURE !== "1",
});

client.on("connect", () => {
  client.subscribe(`${prefix}/#`, { qos: 1 }, (error) => {
    if (error) {
      console.error("subscribe ไม่สำเร็จ:", error.message);
      process.exit(1);
    }
  });
});

client.on("message", (topic, payload) => {
  if (seen.has(topic)) return;
  seen.set(topic, {
    at: new Date().toISOString().slice(11, 19),
    preview: payload.toString().replace(/\s+/g, " ").slice(0, 120),
  });
});

client.on("error", (error) => {
  console.error("MQTT error:", error.message);
});

client.on("close", () => {
  // a clean exit follows; an early close is reported by the timeout below
});

const timer = setTimeout(() => {
  console.log(`\nbroker ${url} · node ${nodeId} · ${waitMs / 1000}s window\n`);
  let missing = 0;
  for (const topic of expected) {
    const hit = seen.get(topic);
    if (hit) console.log(`✓ ${topic}  ${hit.at}  ${hit.preview}`);
    else {
      missing += 1;
      console.log(`✗ ${topic}  — ไม่มีข้อความ`);
    }
  }

  const extra = [...seen.keys()].filter((topic) => !expected.includes(topic));
  if (extra.length > 0) {
    console.log("\ntopic อื่นที่ได้รับ:");
    for (const topic of extra) console.log(`  · ${topic}  ${seen.get(topic).preview}`);
  }

  client.end(true);
  process.exit(missing === 0 ? 0 : 1);
}, waitMs);
