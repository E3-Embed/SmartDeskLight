/**
 * MQTT topic map — keep in sync with firmware/gateway/src/config.h.
 *
 * The gateway publishes `@msg/sdl/<source>/<kind>`; only `gw/status` and
 * `sensor/status` are retained.
 */
export const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? "@msg/sdl";

export const TOPIC_GATEWAY_STATE = `${TOPIC_PREFIX}/gw/state`;
export const TOPIC_GATEWAY_TELEMETRY = `${TOPIC_PREFIX}/gw/telemetry`;
export const TOPIC_GATEWAY_STATUS = `${TOPIC_PREFIX}/gw/status`;
export const TOPIC_SENSOR_TELEMETRY = `${TOPIC_PREFIX}/sensor/telemetry`;
export const TOPIC_SENSOR_HEALTH = `${TOPIC_PREFIX}/sensor/health`;
export const TOPIC_SENSOR_STATUS = `${TOPIC_PREFIX}/sensor/status`;
export const TOPIC_ALERT = `${TOPIC_PREFIX}/alert`;
export const TOPIC_CMD = `${TOPIC_PREFIX}/cmd`;

/** One subscription covers every data topic. */
export const TOPIC_WILDCARD = `${TOPIC_PREFIX}/#`;

/** The board the dashboard paints. */
export const NODE_ID = process.env.SDL_NODE_ID ?? "N1";

/** `sensor/status` is refreshed every 30 s; older than this means unknown. */
export const SENSOR_STATUS_FRESH_S = 45;
