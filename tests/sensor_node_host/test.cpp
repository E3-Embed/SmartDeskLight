#include <assert.h>
#include <cmath>
#include <vector>
#ifdef _MSC_VER
#define __attribute__(x)
#pragma pack(push, 1)
#include "../../firmware/common/message.h"
#pragma pack(pop)
#endif
#include "../../firmware/sensor_node/src/sensors.cpp"
#include "../../firmware/sensor_node/src/main.cpp"
uint32_t fakeTime = 0;
uint8_t fakeChannel = 1;
SerialMock Serial;
EspMock ESP;
WireMock Wire;
WireMock &Wire1 = Wire;
WiFiMock WiFi;
ReceiveCallback receiveCallback = nullptr;
namespace status_led {
void begin() {}
void task(void *) {}
void setLinkState(LinkState) {}
}
static const uint8_t gatewayMac[6] = {2, 1, 2, 3, 4, 5};
static int sendCount = 0, ackOnAttempt = 0, ackKind = 0;
static bool discovery = false;
static std::vector<uint8_t> firstPacket;
static SdlTelemetry lastTelemetry{};
static int telemetryCount = 0;

static void deliverAck(const uint8_t *mac, const SdlAck &ack, int length = sizeof(SdlAck)) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_now_recv_info_t info{mac};
  onRecv(&info, reinterpret_cast<const uint8_t *>(&ack), length);
#else
  onRecv(mac, reinterpret_cast<const uint8_t *>(&ack), length);
#endif
}
int esp_now_send(const uint8_t *, const uint8_t *bytes, size_t length) {
  ++sendCount;
  if (!discovery && sendCount == 1) firstPacket.assign(bytes, bytes + length);
  if (!discovery) assert(firstPacket == std::vector<uint8_t>(bytes, bytes + length));
  uint32_t seq;
  memcpy(&seq, bytes + 3, sizeof(seq));
  if (length == sizeof(SdlTelemetry)) {
    memcpy(&lastTelemetry, bytes, length);
    ++telemetryCount;
  }
  if ((discovery && fakeChannel == 6) || (!discovery && sendCount == ackOnAttempt)) {
    SdlAck ack{SDL_PROTO_VERSION, SDL_MSG_ACK, nodecfg::kNodeId, seq};
    uint8_t wrongMac[6] = {9, 9, 9, 9, 9, 9};
    if (ackKind == 1) ++ack.seq;
    if (ackKind == 2) ++ack.version;
    if (ackKind == 3) ++ack.node_id;
    if (ackKind == 4) ack.type = SDL_MSG_SYS;
    if (ackKind != 7) deliverAck(ackKind == 5 ? wrongMac : gatewayMac, ack,
                               ackKind == 6 ? sizeof(SdlAck) - 1 : sizeof(SdlAck));
  }
  return ackKind == 7 ? -1 : ESP_OK;
}

static void warmSensors(bool missingColor = false) {
  fakeTime = 0;
  Wire = WireMock{};
  Wire.tcsMissing = missingColor;
  sensors::begin();
  assert(Wire.begins == 2);  // BH1750 bus + separate TCS34725 bus (Wire1)
  SensorSample v;
  assert(!sensors::read(v));  // starts conversion, no invented zero measurement
  assert(fakeTime == 0);  // no blocking conversion delay
  if (!missingColor) {
    assert((Wire.writes.back() == std::vector<uint8_t>{0x80, 0x01}));
    const size_t writesBefore = Wire.writes.size();
    fakeTime = 2;
    assert(!sensors::read(v) && Wire.writes.size() == writesBefore);
  }
  fakeTime = 3;
  assert(!sensors::read(v));
  if (!missingColor) assert((Wire.writes.back() == std::vector<uint8_t>{0x80, 0x03}));
  fakeTime = 183;
}

static void checkAck(int ackAt, int kind, bool expected, int calls, uint32_t elapsed) {
  fakeTime = 0;
  sendCount = 0; ackOnAttempt = ackAt; ackKind = kind; gAck = AckInfo{};
  discovery = false;
  SdlTelemetry pkt{};
  pkt.version = SDL_PROTO_VERSION;
  pkt.type = SDL_MSG_TELEMETRY;
  pkt.node_id = nodecfg::kNodeId;
  pkt.seq = 42;
  assert(sendAndWait(gatewayMac, &pkt, sizeof(pkt), pkt.seq, 1 + SDL_MAX_RETRY,
                     SDL_ACK_TIMEOUT_MS, gatewayMac) == expected);
  assert(sendCount == calls && fakeTime == elapsed);
}

int main() {
  SensorSample v;
  warmSensors();
  assert(sensors::read(v) && v.bh1750Ok && v.tcsOk);
  assert(std::fabs(v.lux - 1000.0f) < 0.01f);
  assert(v.r == 1000 && v.g == 1500 && v.b == 1200 && v.c == 4000 && v.cct == 5963);
  assert(!sensors::read(v));  // don't immediately report the same conversion as fresh
  assert(!v.bh1750Ok && !v.tcsOk && v.lux == 0);
  fakeTime += 1000; Wire.luxRaw = 0; Wire.clear = 0;
  assert(sensors::read(v) && v.bh1750Ok && v.lux == 0 && v.cct == 0);
  fakeTime += 1000; Wire.clear = 43008; Wire.luxRaw = 0xFFFF;
  assert(sensors::read(v) && !v.bh1750Ok && v.tcsOk && v.cct == 0);
  fakeTime += 1000; Wire.shortRead = true;
  assert(!sensors::read(v) && !v.bh1750Ok && !v.tcsOk);
  Wire.shortRead = false; sensors::reportPresence();
  assert(!sensors::read(v));
  fakeTime += 3; sensors::read(v);
  fakeTime += 180; Wire.luxRaw = 1200;
  assert(sensors::read(v) && v.bh1750Ok && v.tcsOk);  // reconnect/reinitialize

  warmSensors(true);
  assert(sensors::read(v) && v.bh1750Ok && !v.tcsOk && v.cct == 0);
  warmSensors(); Wire.id = 0;  // reinitialize with wrong color sensor identity
  sensors::begin(); sensors::read(v); fakeTime += 200;
  assert(sensors::read(v) && v.bh1750Ok && !v.tcsOk);
  warmSensors(); fakeTime += 1000; Wire.valid = false;
  assert(sensors::read(v) && v.bh1750Ok && !v.tcsOk);
  warmSensors(); fakeTime += 1000; Wire.bhMissing = true;
  assert(sensors::read(v) && !v.bh1750Ok && v.tcsOk);
  warmSensors(); fakeTime = 0xFFFFFFF0u; sensors::begin(); sensors::read(v);
  fakeTime += 3; sensors::read(v); fakeTime += 180;
  assert(sensors::read(v) && v.bh1750Ok && v.tcsOk);  // millis() rollover
  Wire = WireMock{}; Wire.transactionMs = 5; sensors::begin();
  uint32_t before = fakeTime; sensors::read(v);
  assert(fakeTime - before <= nodecfg::kSensorReadBudgetMs);

  checkAck(1, 0, true, 1, 0);
  checkAck(4, 0, true, 4, 300);
  checkAck(0, 0, false, 4, 400);
  for (int kind = 1; kind <= 6; ++kind) checkAck(1, kind, false, 4, 400);
  checkAck(1, 7, false, 1, 0);
  sendCount = 0; ackKind = 0; discovery = true; gSeq = 0; gAck = AckInfo{};
  assert(linkUp() && gLinkChannel == 6 && memcmp(gGatewayMac, gatewayMac, 6) == 0);
  discovery = false;
  warmSensors(true);
  fakeTime = 1000; gLinked = true; gAck.atMs = fakeTime;
  gLastHeartbeatMs = fakeTime; gLastSensorMs = 0; gLastPresenceReportMs = fakeTime;
  telemetryCount = 0; sendCount = 0; ackOnAttempt = 1; gSeq = 100;
  loop();
  assert(telemetryCount == 1 && lastTelemetry.seq == 101);
  assert(std::fabs(lastTelemetry.lux - 1000.0f) < 0.01f && lastTelemetry.cct == 0);
  fakeTime += 1000; Wire.bhMissing = true; gLastHeartbeatMs = fakeTime;
  loop(); assert(telemetryCount == 1);  // failed lux must never transmit fake darkness
  puts("PASS: nonblocking sensor drivers, partial sensors, recovery, saturation, rollover,");
  puts("ACK validation/retry timing, channel discovery, production telemetry loop (Arduino 2/3)");
}
