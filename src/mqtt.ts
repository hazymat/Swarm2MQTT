import {mqttErrorText} from "./mqttprobe.js";
// MQTT bridge: base topic, per-device topic and format, bridge state with last will, heartbeat, events
import mqtt, {type MqttClient} from "mqtt";
import type {DeviceRow, GroupRow} from "./store.js";

export interface MqttSettings {url: string; username?: string; password?: string; baseTopic: string; heartbeatSeconds: number; retain: boolean}
export const DEFAULT_MQTT: MqttSettings = {url: "", baseTopic: "swarm2mqtt", heartbeatSeconds: 60, retain: false};

export function renamedValues(device: Pick<DeviceRow, "renames">, values: Record<string, unknown>) {const renamed: Record<string, unknown> = {}; for (const [key, value] of Object.entries(values)) renamed[device.renames?.[key] || key] = value; return renamed}
export function payloadsFor(device: Pick<DeviceRow, "topic" | "format" | "renames">, values: Record<string, unknown>, base: string): [string, string][] {
  const renamed = renamedValues(device, values);
  const topic = `${base}/${device.topic}`, out: [string, string][] = [];
  if (device.format !== "values") out.push([topic, JSON.stringify(renamed)]);
  if (device.format !== "json") for (const [key, value] of Object.entries(renamed)) out.push([`${topic}/${key}`, typeof value === "string" ? value : JSON.stringify(value)]);
  return out;
}

// What went out for a device, kept in memory: the last few, newest first, for "Sent over MQTT"
export interface SentMessage {ts: number; topic: string; format: DeviceRow["format"]; topics: number; message: Record<string, unknown>}
export const SENT_KEPT = 3;

export class MqttBridge {
  client?: MqttClient;
  sent = new Map<string, SentMessage[]>();
  connected = false;
  error?: string;
  heartbeat?: NodeJS.Timeout;
  constructor(public settings: () => MqttSettings, public onSet: (topic: string, payload: string) => void, public tele: () => Record<string, unknown>, public onStatus: () => void) {}
  get base() {return this.settings().baseTopic.replace(/\/+$/, "") || "swarm2mqtt"}
  start() {
    this.stop();
    const settings = this.settings();
    if (!settings.url) {this.error = undefined; this.onStatus(); return}
    const offline = JSON.stringify({state: "offline"});
    this.client = mqtt.connect(settings.url, {username: settings.username || undefined, password: settings.password || undefined, reconnectPeriod: 5000, will: {topic: `${this.base}/bridge/state`, payload: Buffer.from(offline), retain: true, qos: 1}});
    this.client.on("connect", () => {
      this.connected = true; this.error = undefined; this.onStatus();
      this.client!.publish(`${this.base}/bridge/state`, JSON.stringify({state: "online"}), {retain: true, qos: 1});
      this.client!.subscribe(`${this.base}/#`);
      this.beat();
    });
    this.client.on("close", () => {if (this.connected) {this.connected = false; this.onStatus()}});
    this.client.on("error", error => {this.error = mqttErrorText(error); this.connected = false; this.onStatus()});
    this.client.on("message", (topic, payload) => {if (topic.endsWith("/set")) this.onSet(topic.slice(this.base.length + 1), payload.toString())});
    this.restartHeartbeat();
  }
  restartHeartbeat() {clearInterval(this.heartbeat); const seconds = this.settings().heartbeatSeconds; if (seconds > 0) this.heartbeat = setInterval(() => this.beat(), seconds * 1000)}
  beat() {if (this.connected) this.client!.publish(`${this.base}/bridge/tele`, JSON.stringify(this.tele()))}
  async stop() {clearInterval(this.heartbeat); if (this.client) {const client = this.client; this.client = undefined; if (this.connected) client.publish(`${this.base}/bridge/state`, JSON.stringify({state: "offline"}), {retain: true}); await client.endAsync().catch(() => {})} this.connected = false}
  publish(topic: string, payload: string, retain = this.settings().retain) {if (this.connected) this.client!.publish(topic, payload, {retain})}
  device(device: DeviceRow, values: Record<string, unknown>) {
    if (device.status !== "accepted" || !this.connected) return;
    const payloads = payloadsFor(device, values, this.base);
    for (const [topic, payload] of payloads) this.publish(topic, payload);
    const list = [{ts: Date.now(), topic: `${this.base}/${device.topic}`, format: device.format, topics: payloads.length, message: structuredClone(renamedValues(device, values))}].concat(this.sent.get(device.ieee) ?? []);
    this.sent.set(device.ieee, list.slice(0, SENT_KEPT));
  }
  lastSent(ieee: string) {return this.sent.get(ieee)?.[0]?.ts}
  availability(device: DeviceRow, online: boolean) {if (device.status === "accepted") this.publish(`${this.base}/${device.topic}/availability`, JSON.stringify({state: online ? "online" : "offline"}), true)}
  group(group: GroupRow, values: Record<string, unknown>) {this.publish(`${this.base}/${group.topic}`, JSON.stringify(values))}
  event(type: string, data: Record<string, unknown>) {this.publish(`${this.base}/bridge/event`, JSON.stringify(Object.assign({type}, data)))}
  clearRetained(topic: string) {this.publish(`${this.base}/${topic}/availability`, "", true)}
}
