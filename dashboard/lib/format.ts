export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function formatLux(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export function formatKelvin(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export function formatWatts(milliWatts: number | null | undefined): string {
  if (milliWatts == null || !Number.isFinite(milliWatts)) return "—";
  return (milliWatts / 1000).toFixed(1);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const day = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (day > 0) return `${day} วัน ${hr} ชม.`;
  if (hr > 0) return `${hr} ชม. ${min} น.`;
  if (min > 0) return `${min} น.`;
  return `${s} วิ`;
}

export function formatAgo(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null) return "ยังไม่มีข้อมูล";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 2) return "เมื่อสักครู่";
  if (s < 60) return `${s} วิที่แล้ว`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  return `${Math.floor(min / 60)} ชม.ที่แล้ว`;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatChip(milliWatts: number | null | undefined): string {
  if (milliWatts == null || !Number.isFinite(milliWatts)) return "—";
  return milliWatts >= 1000 ? `${formatWatts(milliWatts)} W` : `${Math.round(milliWatts)} mW`;
}

export function modeLabel(mode: string | undefined): { th: string; en: string } {
  switch (mode) {
    case "coding":
      return { th: "เขียนโค้ด", en: "Coding" };
    case "drawing":
      return { th: "วาดรูป", en: "Drawing" };
    default:
      return { th: "อ่านหนังสือ", en: "Reading" };
  }
}
