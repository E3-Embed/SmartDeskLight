// Quick broker probe: node --env-file=.env.local scripts/probe.mjs
// Connects with the dashboard device credentials, subscribes to the topics the
// gateway publishes, and reports which ones answer. Never prints the password.
import mqtt from "mqtt";

const url = process.env.MQTT_URL ?? "mqtts://gw.embed.rachatat.com:8883";
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;
const clientId = process.env.MQTT_CLIENT_ID ?? "sdl-probe";
const prefix = process.env.MQTT_TOPIC_PREFIX ?? "@msg/sdl";

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

const topics = [
  "@shadow/data/update",
  `${prefix}/sys`,
  `${prefix}/status`,
  `${prefix}/alert`,
  `${prefix}/+/telemetry`,
];

const seen = new Map();
const client = mqtt.connect(url, {
  clientId,
  username,
  password,
  keepalive: 30,
  connectTimeout: 10_000,
  reconnectPeriod: 0,
  rejectUnauthorized: true,
});

const timeout = setTimeout(() => {
  finish("หมดเวลา 40 วินาที");
}, 40_000);

function finish(reason) {
  clearTimeout(timeout);
  console.log(`\nสรุป (${reason})`);
  for (const topic of topics) {
    const payload = seen.get(topic);
    if (!payload) {
      console.log(`  ✗ ${topic}  ไม่ได้รับข้อมูล`);
      continue;
    }
    const preview = payload.length > 220 ? `${payload.slice(0, 220)}…` : payload;
    console.log(`  ✓ ${topic}\n      ${preview}`);
  }
  client.end(true, () => process.exit(0));
}

client.on("connect", () => {
  console.log(`connected: ${url} as ${username} (clientId ${clientId})`);
  client.subscribe(topics, { qos: 1 }, (error, granted) => {
    if (error) {
      console.error("subscribe ล้มเหลว:", error.message);
      finish("subscribe error");
      return;
    }
    for (const grant of granted) {
      console.log(`  subscribed qos${grant.qos} ${grant.topic}`);
    }
    console.log("รอข้อมูลสูงสุด 40 วินาที (shadow ทุก 30 วิ, sys ทุก 10 วิ)…");
  });
});

client.on("message", (topic, payload) => {
  const text = payload.toString();
  const key = topics.includes(topic) ? topic : `${prefix}/+/telemetry`;
  if (!seen.has(key)) {
    seen.set(key, text);
    if (seen.size === topics.length) finish("ได้ครบทุก topic");
  }
});

client.on("error", (error) => {
  console.error("MQTT error:", error.message);
  if (/Not authorized/i.test(error.message)) {
    console.error("→ ตรวจ ACL: subscribe @shadow/data/update และ @msg/sdl/#");
  }
  if (/Bad username or password/i.test(error.message)) {
    console.error("→ ตรวจ MQTT_USERNAME / MQTT_PASSWORD ใน .env.local");
  }
  finish("connection error");
});
