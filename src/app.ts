// The app: ties the store, the radio supervisor, MQTT and the web page together. Never exits because of the adapter.
import {EventEmitter} from "node:events";
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync} from "node:fs";
import {spawn} from "node:child_process";
import {Store, type DeviceRow, type Format, type GroupRow} from "./store.js";
import {Radio, type Control, type RadioDevice, type RadioStatus} from "./radio/radio.js";
import {SimRadio} from "./radio/sim.js";
import {HerdsmanRadio, adapterLog, type StickConfig} from "./radio/herdsman.js";
import {JoinWatch, diagnose} from "./joinwatch.js";
import {MqttBridge, DEFAULT_MQTT, type MqttSettings} from "./mqtt.js";
import {addGap, health, type Health} from "./health.js";
import {translate} from "./errors.js";

const newerThan = (candidate: string, current: string) => {const left = candidate.split(".").map(Number), right = current.split(".").map(Number); for (let index = 0; index < 3; index++) if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0); return false};
export const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const LINK_SCAN_MS = 6 * 3600e3, BACKUPS_KEPT = 14, REJOIN_SECONDS = 180;
export interface Prefs {batteryLeadDays: number; batteryPercent: number; stats: boolean; updateChannel: "stable" | "dev"}
const DEFAULT_PREFS: Prefs = {batteryLeadDays: 21, batteryPercent: 10, stats: false, updateChannel: "stable"};
export type Op = {op: "device"; ieee: string; fields: Partial<DeviceRow>} | {op: "setting"; key: string; value: unknown} | {op: "group"; group: GroupRow | null; id: number} | {op: "scene"; scene: any; id: number} | {op: "bind"; from: string; to: string; remove: boolean} | {op: "rejoin"; row: DeviceRow} | {op: "remove"; ieee: string} | {op: "values"; ieee: string; values: Record<string, unknown>};

export const slug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "device";
const pick = <T extends object>(source: T, keys: (keyof T)[]) => {const out: Partial<T> = {}; for (const key of keys) out[key] = structuredClone(source[key]); return out};

export class App extends EventEmitter {
  store: Store;
  radio?: Radio;
  radioStatus: RadioStatus = {up: false, reason: "Starting…"};
  mqtt: MqttBridge;
  joinEndsAt = 0;
  joinFound: string[] = []; joinVia?: string;
  rejoinRows = new Map<string, DeviceRow>();
  scan: {running: boolean; startedAt?: number; finishedAt?: number; asking?: string; done: number; total: number; answered: {ieee: string; hears: number}[]; silent: string[]} = {running: false, done: 0, total: 0, answered: [], silent: []};
  joinWatch = new JoinWatch(() => this.changed());
  networkUpAt = 0; // devices not heard yet get their check-in time from here
  retryMs = 2000; retryDelay = 2000; attempts = 0; lastRadioError?: string;
  retryTimer?: NodeJS.Timeout;
  scanTimer?: NodeJS.Timeout;
  signals = new Map<string, {rssi: number; lqi?: number; at: number}>(); // strength of the last frame heard from each device, as the adapter measured it
  strays = new Set<string>(); unreset = new Set<string>(); // removed without answering: if it turns up again, it wasn't reset // found on the network but missing from the device list
  scanSoon = false;
  onlineCache = new Map<string, boolean>();
  firmwareProgress = new Map<string, {percent: number; secondsLeft?: number}>();
  startedAt = Date.now();
  constructor(public dataDir: string, public sim: boolean) {
    super();
    mkdirSync(dataDir, {recursive: true});
    this.store = new Store(`${dataDir}/swarm2mqtt.db`);
    this.mqtt = new MqttBridge(() => this.mqttSettings, (topic, payload) => this.onMqttSet(topic, payload), () => this.tele(), () => this.changed());
  }
  get mqttSettings(): MqttSettings {return Object.assign({}, DEFAULT_MQTT, this.store.get("mqtt", {}))}
  // the update channel follows the running build (dev build → dev channel) until the user picks one
  get prefs(): Prefs {return Object.assign({}, DEFAULT_PREFS, {updateChannel: this.update.channel ?? "stable"}, this.store.get("prefs", {}))}
  get stick(): StickConfig | undefined {return this.store.get<StickConfig | undefined>("stick", undefined)}

  // What's new: shown once after an update. Before 0.1.7 there was no record of the last version, so an "Updating to" log line counts too.
  whatsNew = {updated: false, seen: undefined as number | undefined};
  noteVersion() {
    const last = this.store.get<string | undefined>("lastVersion", undefined);
    const updatingLine: any = this.store.db.prepare("SELECT id FROM events WHERE text=? LIMIT 1").get(`Updating Swarm2MQTT to ${VERSION}…`);
    this.whatsNew = {updated: last ? last !== VERSION : !!updatingLine, seen: this.store.get<number | undefined>("whatsNewSeen", undefined)};
    this.store.put("lastVersion", VERSION);
  }
  markWhatsNewSeen(id: number) {this.store.put("whatsNewSeen", id); this.whatsNew = {updated: false, seen: id}; this.changed()}

  async start() {
    this.noteVersion();
    this.mqtt.start();
    this.startRadio();
    setInterval(() => {this.store.prune(); this.dailyBackup(); this.checkAvailability()}, 60e3).unref();
    setInterval(() => {this.checkAvailability(); if (!this.radioStatus.up && this.stick) this.changed()}, 5e3).unref(); // while the adapter isn't up, the page sees its messages as they come
    this.dailyBackup();
    // look for app updates soon after starting, then hourly and whenever a page opens (at most every 10 min); the page shows a bar when one is out
    if (!this.sim) {setTimeout(() => this.checkUpdate().catch(() => {}), 5e3).unref(); setInterval(() => this.checkUpdate().catch(() => {}), 120e3).unref()}
  }
  // Radio supervisor: start, and on any failure mark it down and try again with backoff. Everything else keeps running.
  startRadio() {
    clearTimeout(this.retryTimer);
    if (!this.sim && !this.stick) {this.setRadioStatus({up: false, reason: "No Zigbee adapter set up yet."}); return}
    this.attempts++;
    if (!this.sim) this.setRadioStatus({up: false, connecting: true, reason: "Connecting to the Zigbee adapter…", since: Date.now(), attempts: this.attempts, lastError: this.lastRadioError});
    const radio: Radio = this.sim ? new SimRadio() : new HerdsmanRadio(this.stick!, this.dataDir);
    this.radio = radio;
    radio.on("status", status => {this.setRadioStatus(status); if (!status.up && radio === this.radio) this.retryRadio()});
    radio.on("state", (ieee, values, lqi) => this.onState(ieee, values, lqi));
    radio.on("heard", ieee => this.onHeard(ieee));
    radio.on("joinStep", (ieee, step) => this.joinWatch.step(ieee, step));
    radio.on("joinFailed", (ieee, error) => this.joinWatch.fail(ieee, this.joinWatch.reports.get(ieee)?.failing?.step ?? "identified", error ?? "no answer"));
    radio.on("signal", (ieee, rssi, lqi) => {this.joinWatch.heard(ieee, rssi, lqi); if (rssi !== undefined) this.signals.set(ieee, {rssi, lqi, at: Date.now()})});
    radio.on("delivery", (ieee, ok) => this.joinWatch.delivered(ieee, ok));
    radio.on("joinInfo", (ieee, info) => {if (this.joinWatch.watching(ieee) || this.joinEndsAt > Date.now()) this.joinWatch.set(ieee, info)});
    radio.on("stray", ieee => {this.strays.add(ieee); this.scanSoon = true});
    radio.on("joined", ieee => this.onJoined(ieee));
    radio.on("interview", (ieee, status) => this.onInterview(ieee, status));
    radio.on("left", ieee => {const device = this.store.device(ieee); if (device) this.log("warn", `${device.name} left the network.`, ieee)});
    radio.on("permitJoin", seconds => {this.joinEndsAt = seconds ? Date.now() + seconds * 1000 : 0; if (!seconds) this.joinFound = []; this.changed()});
    radio.start().then(() => {if (this.stick?.formNew) this.store.put("stick", Object.assign({}, this.stick, {formNew: undefined})); /* formed: from now on it never leaves its network by itself */ this.retryMs = 2000; this.attempts = 0; this.lastRadioError = undefined; this.syncDevices(); this.scheduleScan(5000); this.pingRouters()}).catch(error => {const text = translate(String(error?.message ?? error)).text; this.lastRadioError = text; this.log("bad", text, undefined, [String(error?.stack ?? error)].concat(adapterLog.slice(-30)).join("\n")); this.retryRadio(); this.setRadioStatus({up: false, reason: "Can't connect to the Zigbee adapter", attempts: this.attempts, lastError: text, nextTry: Date.now() + this.retryDelay})});
  }
  retryRadio() {
    clearTimeout(this.retryTimer); clearTimeout(this.scanTimer);
    const radio = this.radio; this.radio = undefined; radio?.removeAllListeners(); radio?.stop().catch(() => {});
    this.retryDelay = this.retryMs; this.retryTimer = setTimeout(() => this.startRadio(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 60e3);
  }
  async restartRadio() {clearTimeout(this.retryTimer); this.attempts = 0; const radio = this.radio; this.radio = undefined; radio?.removeAllListeners(); await radio?.stop().catch(() => {}); this.retryMs = 2000; this.startRadio()}
  setRadioStatus(status: RadioStatus) {const wasUp = this.radioStatus.up; if (status.up && !wasUp) this.networkUpAt = Date.now(); this.radioStatus = status; if (wasUp !== status.up) {this.log(status.up ? "info" : "bad", status.up ? "Zigbee adapter connected." : status.reason ?? "Zigbee adapter lost."); this.mqtt.event(status.up ? "adapter_up" : "adapter_down", {text: status.reason})} this.changed()}

  // Bring the store in line with what the radio knows about
  syncDevices() {for (const radioDevice of this.radio?.list() ?? []) this.upsert(radioDevice, false); this.changed()}
  upsert(radioDevice: RadioDevice, isNew: boolean): DeviceRow {
    let device = this.store.device(radioDevice.ieee);
    if (!device) {
      const rejoin = this.rejoinRows.get(radioDevice.ieee);
      const name = rejoin?.name ?? this.uniqueName(radioDevice.model ?? "New device");
      device = rejoin ? structuredClone(rejoin) : {ieee: radioDevice.ieee, name, topic: this.uniqueTopic(slug(name)), format: "json", renames: {}, status: isNew ? "waiting" : "accepted", kind: radioDevice.kind, supported: radioDevice.supported, controls: [], hidden_controls: [], added_at: Date.now(), state: {}, gaps: []};
      if (rejoin) {this.rejoinRows.delete(radioDevice.ieee); this.log("info", `${device.name} is back, with its old settings.`, device.ieee)}
    }
    device.kind = radioDevice.kind; device.model = radioDevice.model; device.vendor = radioDevice.vendor; device.description = radioDevice.description; device.supported = radioDevice.supported; device.firmware = radioDevice.firmware;
    if (radioDevice.controls.length) device.controls = this.mergeControls(device.controls, radioDevice.controls);
    this.store.saveDevice(device);
    return device;
  }
  // keep controls the user added; replace library ones
  mergeControls(existing: Control[], fromLibrary: Control[]) {return fromLibrary.concat(existing.filter(control => (control as any).added && !fromLibrary.some(libraryControl => libraryControl.property === control.property)))}
  uniqueName(base: string, except?: string) {const names = new Set(this.store.devices().filter(device => device.ieee !== except).map(device => device.name)); let name = base, count = 2; while (names.has(name)) name = `${base} ${count++}`; return name}
  uniqueTopic(base: string, except?: string) {const topics = new Set(this.store.devices().filter(device => device.ieee !== except).map(device => device.topic).concat(this.store.groups().map(group => group.topic))); let topic = base, count = 2; while (topics.has(topic) || topic === "bridge") topic = `${base}_${count++}`; return topic}

  onHeard(ieee: string) {this.retryJoin(ieee); const device = this.store.device(ieee); if (!device) return; addGap(device, Date.now()); this.store.saveDevice(device); this.availabilityChanged(device)}
  onState(ieee: string, values: Record<string, unknown>, lqi?: number) {
    const device = this.store.device(ieee);
    if (!device) return;
    if (lqi !== undefined) values = Object.assign({}, values, {linkquality: lqi});
    addGap(device, Date.now());
    Object.assign(device.state, values);
    this.store.saveDevice(device);
    this.store.record(ieee, values);
    this.mqtt.device(device, device.state);
    this.availabilityChanged(device);
    this.emit("state", ieee, values);
    this.changed();
  }
  onJoined(ieee: string) {
    if (!this.joinFound.includes(ieee)) this.joinFound.push(ieee);
    this.joinWatch.step(ieee, "joined");
    const radioDevice = this.radio?.list().find(candidate => candidate.ieee === ieee);
    const device = radioDevice ? this.upsert(radioDevice, true) : undefined;
    const stray = this.strays.delete(ieee), notReset = this.unreset.delete(ieee);
    if (device) {this.log("info", notReset ? `${device.name} came back without being reset: it still had your network. It's being set up from scratch.` : stray ? `Found ${device.name} on your network. It wasn't in the device list, so it's waiting for you.` : device.status === "waiting" ? `A new device joined: ${device.name}. It's waiting for you.` : `${device.name} rejoined.`, ieee); this.mqtt.event("device_joined", {ieee, name: device.name})}
    this.changed();
  }
  onInterview(ieee: string, status: string) {
    const radioDevice = this.radio?.list().find(candidate => candidate.ieee === ieee);
    if (radioDevice) this.upsert(radioDevice, true);
    if (status === "failed") {this.joinWatch.failed(ieee); const verdict = this.joinWatch.reports.get(ieee)?.verdict; this.log("warn", verdict ? `${this.store.device(ieee)?.name ?? ieee}: ${verdict.headline}. ${verdict.why}` : translate("Interview failed").text, ieee)}
    if (status === "successful") {this.joinWatch.step(ieee, "ready"); if (radioDevice && !radioDevice.supported) this.joinWatch.set(ieee, {unknownModel: [radioDevice.vendor, radioDevice.model].filter(Boolean).join(" ") || "an unknown model"})}
    this.changed();
  }
  // a device that didn't finish joining gets another go each time it's heard (a sleepy one is awake right then), at most once a minute, 10 times
  retryJoin(ieee: string) {
    const report = this.joinWatch.reports.get(ieee);
    if (!report || !this.radio || (report.outcome !== "failed" && report.outcome !== "stuck") || report.retries >= 10 || Date.now() - (report.lastRetry ?? 0) < 60e3) return;
    report.retries++; report.lastRetry = Date.now(); report.outcome = "joining"; this.changed();
    this.radio.reinterview(ieee).catch(() => {});
  }
  async joinAgain(ieee: string) {if (!this.radio) throw new Error("The adapter isn't connected."); const report = this.joinWatch.report(ieee); report.outcome = "joining"; report.failing = undefined; report.retries++; report.lastRetry = Date.now(); this.changed(); await this.radio.reinterview(ieee)}
  checkAvailability() {this.joinWatch.sweep(); for (const device of this.store.devices()) this.availabilityChanged(device)}
  availabilityChanged(device: DeviceRow) {
    const online = this.healthOf(device).online, before = this.onlineCache.get(device.ieee);
    if (before === online) return;
    this.onlineCache.set(device.ieee, online);
    this.mqtt.availability(device, online);
    if (before !== undefined && device.status === "accepted") {this.log(online ? "info" : "warn", online ? `${device.name} is answering again.` : `${device.name} went quiet.`, device.ieee); this.mqtt.event(online ? "device_online" : "device_offline", {ieee: device.ieee, name: device.name})}
    this.changed();
  }

  // Health uses the latest mesh snapshot for "talks through"
  parents(): Map<string, string> {const map = new Map<string, string>(); for (const link of this.store.linksAt().links) map.set(link.child, link.parent); return map}
  healthOf(device: DeviceRow, parents = this.parents(), devices?: Map<string, DeviceRow>): Health {
    const all = devices ?? new Map(this.store.devices().map(row => [row.ieee, row])), now = Date.now(), prefs = this.prefs;
    const stickIeee = this.stickIeee();
    const isOnline = (ieee: string) => ieee === stickIeee ? this.radioStatus.up : (() => {const row = all.get(ieee); return !!row && health(row, now, () => undefined, () => true, () => "", [], prefs.batteryLeadDays, prefs.batteryPercent).online})();
    const result = health(device, now, ieee => parents.get(ieee), isOnline, ieee => ieee === stickIeee ? "the adapter" : all.get(ieee)?.name ?? ieee, typeof device.state.battery === "number" ? this.store.history(device.ieee, "battery") : [], prefs.batteryLeadDays, prefs.batteryPercent, this.networkUpAt);
    // didn't finish joining: that's what's wrong with it, whatever else
    const report = this.joinWatch.reports.get(device.ieee);
    if (report && (report.outcome === "failed" || report.outcome === "stuck" || report.outcome === "left") && result.status !== "waiting") {const verdict = diagnose(report); result.status = "warn"; result.reason = `Didn't finish joining: ${verdict?.headline ?? "stopped answering"}.`; result.fix = "join"}
    // never said what it is (joined half-way, here or before the move): the fix is to start it again
    else if (!device.model && device.status === "accepted" && result.status !== "bad") {result.status = "warn"; result.reason = "Never finished joining: it hasn't said what it is."; result.fix = "start-again"}
    return result;
  }
  stickIeee() {const links = this.store.linksAt().links, children = new Set(links.map(link => link.child)); return links.find(link => !children.has(link.parent))?.parent ?? "stick"}

  // just started: ask each plugged-in device that hasn't been heard lately to answer, so it shows as working straight away (battery ones check in when they wake)
  async pingRouters() {
    for (const device of this.store.devices().filter(row => row.kind === "router" && row.status === "accepted" && (!row.last_seen || Date.now() - row.last_seen > 60e3))) {
      if (!this.radio || !this.radioStatus.up) return;
      try {await this.radio.ping(device.ieee); this.onHeard(device.ieee); this.changed()} catch {}
    }
  }
  scheduleScan(delay = LINK_SCAN_MS) {clearTimeout(this.scanTimer); this.scanTimer = setTimeout(() => this.scanNow().finally(() => {const soon = this.scanSoon; this.scanSoon = false; this.scheduleScan(soon ? 120e3 : LINK_SCAN_MS)}), delay)} // devices found during a check get their own links drawn 2 minutes later
  async scanNow() {
    if (!this.radio || !this.radioStatus.up || this.scan.running) return;
    this.scan = {running: true, startedAt: Date.now(), done: 0, total: 0, answered: [], silent: [], finishedAt: this.scan.finishedAt}; this.changed();
    try {
      const links = await this.radio.scanLinks(step => {Object.assign(this.scan, step); this.changed()}), before = this.parents();
      this.store.saveLinks(links); this.scan.finishedAt = Date.now(); this.store.put("lastScan", this.scan.finishedAt);
      const silent = this.scan.silent.map(ieee => this.store.device(ieee)?.name ?? "The adapter"); if (silent.length) this.log("warn", `${silent.join(", ")} didn't answer when asked who it hears. ${silent.length === 1 ? "It" : "They"} may be off or out of reach.`);
      for (const link of links) {const old = before.get(link.child); if (old && old !== link.parent) {const name = (ieee: string) => this.store.device(ieee)?.name ?? "the adapter"; this.log("info", `${name(link.child)} now talks through ${name(link.parent)} instead of ${name(old)}.`, link.child)}}
      this.changed();
    } catch (error) {this.log("warn", "Couldn't finish checking who talks through whom. Will try again later.", undefined, String(error))}
    finally {this.scan.running = false; this.scan.asking = undefined; this.changed()}
  }

  // MQTT commands in: <topic>/set (JSON) or <topic>/<field>/set (single value)
  onMqttSet(path: string, payload: string) {
    const parts = path.split("/"); parts.pop();
    const devices = this.store.devices(), groups = this.store.groups();
    for (let cut = parts.length; cut >= 1; cut--) {
      const topic = parts.slice(0, cut).join("/"), field = parts.slice(cut).join("/");
      const device = devices.find(candidate => candidate.topic === topic && candidate.status === "accepted"), group = groups.find(candidate => candidate.topic === topic);
      if (!device && !group) continue;
      let values: Record<string, unknown>;
      try {values = field ? {[this.unrename(device, field)]: parseValue(payload)} : this.unrenameAll(device, JSON.parse(payload))} catch {this.log("warn", `Ignored a message on ${path}/set that isn't valid JSON.`, device?.ieee); return}
      if (device) this.setValues(device.ieee, values).catch(() => {}); else this.groupSet(group!.id, values).catch(() => {});
      return;
    }
  }
  unrename(device: DeviceRow | undefined, field: string) {if (!device) return field; const entry = Object.entries(device.renames).find(([, renamed]) => renamed === field); return entry ? entry[0] : field}
  unrenameAll(device: DeviceRow | undefined, values: Record<string, unknown>) {const out: Record<string, unknown> = {}; for (const [key, value] of Object.entries(values)) out[this.unrename(device, key)] = value; return out}

  // ---------- commands from the web page ----------
  need(ieee: string) {const device = this.store.device(ieee); if (!device) throw new Error("That device isn't known."); return device}
  requireRadio() {if (!this.radio || !this.radioStatus.up) throw new Error("The Zigbee adapter isn't connected, so this can't reach the device right now."); return this.radio}
  async setValues(ieee: string, values: Record<string, unknown>) {
    const device = this.need(ieee);
    try {await this.requireRadio().set(ieee, values)} catch (error) {const message = translate(String((error as Error).message), device.name); this.log("warn", message.text, ieee, String(error)); throw new Error(message.text)}
  }
  // A changed device setting is undoable: we put the old value back on the device
  async changeSetting(ieee: string, property: string, value: unknown) {
    const device = this.need(ieee), old = device.state[property];
    await this.setValues(ieee, {[property]: value});
    const control = device.controls.find(candidate => candidate.property === property);
    return this.pushUndo(`${control?.label ?? property} set to ${value}`, {op: "values", ieee, values: {[property]: value}}, {op: "values", ieee, values: {[property]: old}});
  }
  patchDevice(ieee: string, fields: Partial<DeviceRow>, label: string) {
    const device = this.need(ieee), before = pick(device, Object.keys(fields) as (keyof DeviceRow)[]);
    this.applyDevice(ieee, fields);
    return this.pushUndo(label, {op: "device", ieee, fields}, {op: "device", ieee, fields: before});
  }
  applyDevice(ieee: string, fields: Partial<DeviceRow>) {
    const device = this.need(ieee), oldTopic = device.topic;
    Object.assign(device, structuredClone(fields));
    this.store.saveDevice(device);
    if (oldTopic !== device.topic) {this.mqtt.clearRetained(oldTopic); this.mqtt.availability(device, this.healthOf(device).online)}
    if (fields.status === "accepted") {this.mqtt.device(device, device.state); this.mqtt.availability(device, this.healthOf(device).online)}
    this.changed();
  }
  rename(ieee: string, name: string) {
    const device = this.need(ieee); name = name.trim();
    if (!name) throw new Error("A name can't be empty.");
    if (this.store.devices().some(other => other.ieee !== ieee && other.name === name)) throw new Error(`"${name}" is already used by another device.`);
    const fields: Partial<DeviceRow> = {name};
    if (device.topic === slug(device.name) || /^[a-z0-9_]+_\d+$/.test(device.topic) && device.topic.startsWith(slug(device.name))) fields.topic = this.uniqueTopic(slug(name), ieee); // topic followed the name, so keep following
    return this.patchDevice(ieee, fields, `Renamed to "${name}"`);
  }
  setTopic(ieee: string, topic: string) {
    topic = topic.trim().replace(/^\/+|\/+$/g, "");
    if (!topic) throw new Error("A topic can't be empty.");
    if (topic.split("/")[0] === "bridge") throw new Error(`Topics can't start with "bridge", it's used by Swarm2MQTT itself.`);
    if (this.uniqueTopic(topic, ieee) !== topic) throw new Error(`"${topic}" is already used.`);
    return this.patchDevice(ieee, {topic}, `MQTT topic set to ${topic}`);
  }
  setFormat(ieee: string, format: Format) {return this.patchDevice(ieee, {format}, format === "json" ? "Sends one message" : format === "values" ? "Sends one topic per value" : "Sends both")}
  setRenames(ieee: string, renames: Record<string, string>) {const clean: Record<string, string> = {}; for (const [key, value] of Object.entries(renames)) if (value.trim() && value.trim() !== key) clean[key] = value.trim(); return this.patchDevice(ieee, {renames: clean}, "Field names changed")}
  setOfflineOverride(ieee: string, ms: number | null) {return this.patchDevice(ieee, {offline_after_override: ms ?? undefined}, ms ? "Offline time set by hand" : "Offline time learnt again")}
  hideControl(ieee: string, property: string, hidden: boolean) {const device = this.need(ieee), list = device.hidden_controls.filter(candidate => candidate !== property).concat(hidden ? [property] : []); return this.patchDevice(ieee, {hidden_controls: list}, hidden ? "Control removed" : "Control added back")}
  // add a control for any value the device reports that has no control yet
  addControl(ieee: string, property: string) {
    const device = this.need(ieee), sample = device.state[property];
    if (sample === undefined) throw new Error("The device hasn't reported that value.");
    const control: Control & {added: boolean} = {property, label: property.replace(/_/g, " ").replace(/^./, letter => letter.toUpperCase()), type: typeof sample === "number" ? "numeric" : typeof sample === "boolean" || sample === "ON" || sample === "OFF" ? "binary" : "text", readable: true, writable: false, added: true};
    if (sample === "ON" || sample === "OFF") {control.on = "ON"; control.off = "OFF"}
    return this.patchDevice(ieee, {controls: device.controls.filter(candidate => candidate.property !== property).concat([control]), hidden_controls: device.hidden_controls.filter(candidate => candidate !== property)}, `Added "${control.label}"`);
  }
  accept(ieee: string) {const device = this.need(ieee); this.log("info", `Accepted ${device.name}.`, ieee); return this.patchDevice(ieee, {status: "accepted"}, `Accepted ${device.name}`)}
  // Reject and remove both take the device off the network. Undo opens join and restores everything when it comes back.
  async removeDevice(ieee: string, reject = false) {
    const device = this.need(ieee);
    this.backup("before-remove");
    let answered = true;
    if (this.radio && this.radioStatus.up) {try {answered = await this.radio.remove(ieee)} catch (error) {answered = false}}
    if (!answered) {this.unreset.add(ieee); this.log("warn", `${device.name} didn't answer, so it was forgotten here and in the adapter, but it may still think it's on your network. Reset it before adding it again.`, ieee)}
    this.store.deleteDevice(ieee); this.mqtt.clearRetained(device.topic); this.onlineCache.delete(ieee);
    this.log("info", reject ? `Rejected ${device.name}.` : `Removed ${device.name}.`, ieee);
    this.changed();
    return this.pushUndo(reject ? `Rejected ${device.name}` : `Removed ${device.name}`, {op: "remove", ieee}, {op: "rejoin", row: device});
  }
  async join(seconds: number, via?: string) {await this.requireRadio().permitJoin(seconds, via || undefined); this.joinVia = seconds ? via : undefined; this.joinEndsAt = seconds ? Date.now() + seconds * 1000 : 0; if (!seconds) this.joinFound = []; this.changed()}

  // groups and scenes
  nextId(ids: number[]) {let id = 1; while (ids.includes(id)) id++; return id}
  async createGroup(name: string, members: string[]) {
    name = name.trim() || "New group";
    const group: GroupRow = {id: this.nextId(this.store.groups().map(existing => existing.id)), name, topic: this.uniqueTopic(slug(name)), members: []};
    this.store.saveGroup(group);
    for (const ieee of members) await this.groupMember(group.id, ieee, false, false);
    return this.pushUndo(`Made group "${name}"`, {op: "group", id: group.id, group: this.store.groups().find(existing => existing.id === group.id)!}, {op: "group", id: group.id, group: null});
  }
  async groupMember(groupId: number, ieee: string, remove: boolean, undoable = true) {
    const group = this.store.groups().find(existing => existing.id === groupId);
    if (!group) throw new Error("That group isn't known.");
    const before = structuredClone(group);
    try {await this.requireRadio().groupAdd(groupId, ieee, remove)} catch (error) {throw new Error(translate(String((error as Error).message), this.store.device(ieee)?.name).text)}
    group.members = group.members.filter(member => member !== ieee).concat(remove ? [] : [ieee]);
    this.store.saveGroup(group); this.changed();
    if (undoable) return this.pushUndo(remove ? "Removed from group" : `Added to "${group.name}"`, {op: "group", id: groupId, group}, {op: "group", id: groupId, group: before});
  }
  async applyGroup(id: number, group: GroupRow | null) {
    const current = this.store.groups().find(existing => existing.id === id), wanted = group?.members ?? [];
    for (const ieee of current?.members ?? []) if (!wanted.includes(ieee)) await this.radio?.groupAdd(id, ieee, true).catch(() => {});
    for (const ieee of wanted) if (!current?.members.includes(ieee)) await this.radio?.groupAdd(id, ieee, false).catch(() => {});
    if (group) this.store.saveGroup(group); else this.store.deleteGroup(id);
    this.changed();
  }
  async deleteGroup(id: number) {const group = this.store.groups().find(existing => existing.id === id); if (!group) return; await this.applyGroup(id, null); return this.pushUndo(`Deleted group "${group.name}"`, {op: "group", id, group: null}, {op: "group", id, group})}
  renameGroup(id: number, name: string) {const group = this.store.groups().find(existing => existing.id === id)!, before = structuredClone(group); group.name = name.trim(); group.topic = this.uniqueTopic(slug(group.name)); this.store.saveGroup(group); this.changed(); return this.pushUndo(`Renamed group to "${group.name}"`, {op: "group", id, group}, {op: "group", id, group: before})}
  async groupSet(id: number, values: Record<string, unknown>) {const group = this.store.groups().find(existing => existing.id === id); if (!group) throw new Error("That group isn't known."); await this.requireRadio().groupSet(id, values); this.mqtt.group(group, values)}
  async saveScene(groupId: number, name: string) {
    const states: Record<string, Record<string, unknown>> = {}, group = this.store.groups().find(existing => existing.id === groupId)!;
    for (const ieee of group.members) states[ieee] = structuredClone(this.store.device(ieee)?.state ?? {});
    const scene = {id: this.nextId(this.store.scenes().map(existing => existing.id)), group_id: groupId, name: name.trim() || "Scene", states};
    await this.requireRadio().sceneStore(groupId, scene.id);
    this.store.saveScene(scene); this.changed();
    return this.pushUndo(`Saved scene "${scene.name}"`, {op: "scene", id: scene.id, scene}, {op: "scene", id: scene.id, scene: null});
  }
  async recallScene(id: number) {const scene = this.store.scenes().find(existing => existing.id === id); if (!scene) throw new Error("That scene isn't known."); await this.requireRadio().sceneRecall(scene.group_id, scene.id); this.log("info", `Scene "${scene.name}" on.`)}
  deleteScene(id: number) {const scene = this.store.scenes().find(existing => existing.id === id); if (!scene) return; this.store.deleteScene(id); this.changed(); return this.pushUndo(`Deleted scene "${scene.name}"`, {op: "scene", id, scene: null}, {op: "scene", id, scene})}
  // direct control: a switch bound to a light or group works with the server or MQTT down
  async bind(from: string, to: string, remove = false) {
    const target = to.startsWith("group:") ? Number(to.slice(6)) : to;
    try {await this.requireRadio().bind(from, target, remove)} catch (error) {throw new Error(translate(String((error as Error).message), this.store.device(from)?.name).text)}
    this.store.saveBinding(from, to, remove); this.changed();
    const fromName = this.store.device(from)?.name ?? from, toName = typeof target === "number" ? this.store.groups().find(group => group.id === target)?.name : this.store.device(to)?.name;
    return this.pushUndo(remove ? `${fromName} no longer controls ${toName}` : `${fromName} now controls ${toName}`, {op: "bind", from, to, remove}, {op: "bind", from, to, remove: !remove});
  }
  // firmware: one tap per device, never automatic
  async checkFirmware(ieee: string) {const available = await this.requireRadio().checkFirmware(ieee); this.applyDevice(ieee, {update_available: available}); return available}
  async updateFirmware(ieee: string) {
    const device = this.need(ieee);
    this.firmwareProgress.set(ieee, {percent: 0}); this.changed();
    try {await this.requireRadio().updateFirmware(ieee, (percent, secondsLeft) => {this.firmwareProgress.set(ieee, {percent, secondsLeft}); this.changed()}); this.log("info", `${device.name} firmware updated.`, ieee); this.applyDevice(ieee, {update_available: false}); setTimeout(() => this.syncDevices(), 5000)}
    catch (error) {this.log("warn", `${device.name} firmware update didn't finish. The device keeps its old firmware.`, ieee, String(error)); throw new Error("The update didn't finish. The device keeps its old firmware.")}
    finally {this.firmwareProgress.delete(ieee); this.changed()}
  }

  // settings
  setSetting(key: "mqtt" | "prefs", value: Record<string, unknown>, label: string) {
    const before = this.store.get(key, {}), after = Object.assign({}, before, value);
    this.applySetting(key, after);
    return this.pushUndo(label, {op: "setting", key, value: after}, {op: "setting", key, value: before});
  }
  applySetting(key: string, value: unknown) {
    const oldBase = this.mqtt.base;
    this.store.put(key, value);
    if (key === "mqtt") {if (oldBase !== this.mqtt.base) this.log("info", `MQTT base topic is now ${this.mqtt.base}.`); this.mqtt.stop().then(() => this.mqtt.start())}
    if (key === "stick") this.restartRadio();
    this.changed();
  }

  // ---------- undo / redo, server side so Ctrl+Z works from any page ----------
  pushUndo(label: string, forward: Op, backward: Op) {const id = this.store.pushUndo(label, forward, backward); this.emit("toast", {id, label}); this.changed(); return {undoId: id, label}}
  async undo() {const entry = this.store.lastUndo(false); if (!entry) return; await this.apply(entry.backward); this.store.markUndo(entry.id, true); this.emit("toast", {label: `Undone: ${entry.label}`}); this.changed()}
  async redo() {const entry = this.store.lastUndo(true); if (!entry) return; await this.apply(entry.forward); this.store.markUndo(entry.id, false); this.emit("toast", {label: `Redone: ${entry.label}`}); this.changed()}
  async apply(op: Op) {
    if (op.op === "device") this.applyDevice(op.ieee, op.fields);
    if (op.op === "setting") this.applySetting(op.key, op.value);
    if (op.op === "group") await this.applyGroup(op.id, op.group);
    if (op.op === "scene") {if (op.scene) this.store.saveScene(op.scene); else this.store.deleteScene(op.id); this.changed()}
    if (op.op === "bind") {await this.requireRadio().bind(op.from, op.to.startsWith("group:") ? Number(op.to.slice(6)) : op.to, op.remove); this.store.saveBinding(op.from, op.to, op.remove); this.changed()}
    if (op.op === "values") await this.setValues(op.ieee, op.values);
    if (op.op === "remove") {if (this.store.device(op.ieee)) await this.removeDevice(op.ieee)}
    if (op.op === "rejoin") {this.rejoinRows.set(op.row.ieee, op.row); this.emit("rejoin", {ieee: op.row.ieee, name: op.row.name}); if (this.radio && this.radioStatus.up) await this.join(REJOIN_SECONDS)}
  }

  // ---------- backups: daily and before risky changes, newest 14 kept ----------
  backupDir() {return `${this.dataDir}/backups`}
  backup(reason: string) {
    try {
      const dir = `${this.backupDir()}/${new Date().toISOString().replace(/[:.]/g, "-")}_${reason}`;
      mkdirSync(dir, {recursive: true});
      this.store.db.exec(`VACUUM INTO '${dir.replace(/'/g, "''")}/swarm2mqtt.db'`);
      for (const file of ["herdsman.db", "coordinator_backup.json"]) if (existsSync(`${this.dataDir}/${file}`)) copyFileSync(`${this.dataDir}/${file}`, `${dir}/${file}`);
      const all = this.backups();
      for (const old of all.slice(BACKUPS_KEPT)) rmSync(`${this.backupDir()}/${old.name}`, {recursive: true, force: true});
    } catch (error) {this.log("warn", "Couldn't make a backup.", undefined, String(error))}
  }
  dailyBackup() {const newest = this.backups().find(entry => entry.name.endsWith("_daily")); if (!newest || Date.now() - newest.ts > 864e5) this.backup("daily")}
  backups() {if (!existsSync(this.backupDir())) return []; return readdirSync(this.backupDir()).map(name => ({name, ts: Date.parse(name.slice(0, 19).replace(/-(\d\d)-(\d\d)$/, ":$1:$2").replace(/T(\d\d)-/, "T$1:") + "Z"), reason: name.split("_").pop()})).sort((first, second) => second.name.localeCompare(first.name))}
  // Restoring swaps the files and restarts the service (systemd brings it straight back)
  async restore(name: string) {
    const dir = `${this.backupDir()}/${name}`;
    if (!existsSync(`${dir}/swarm2mqtt.db`)) throw new Error("That backup isn't complete.");
    this.backup("before-restore");
    await this.radio?.stop().catch(() => {}); await this.mqtt.stop();
    this.store.db.close();
    for (const file of ["swarm2mqtt.db", "herdsman.db", "coordinator_backup.json"]) if (existsSync(`${dir}/${file}`)) copyFileSync(`${dir}/${file}`, `${this.dataDir}/${file}`);
    for (const extra of ["swarm2mqtt.db-wal", "swarm2mqtt.db-shm"]) rmSync(`${this.dataDir}/${extra}`, {force: true});
    setTimeout(() => process.exit(75), 300);
  }

  // app updates: GitHub releases, stable or dev channel; the install script swaps versions and systemd restarts us
  update: {latest?: string; available?: boolean; channel?: "stable" | "dev"; checkedAt?: number; running?: boolean} = {};
  checkUpdateSoon() {if (!this.sim && Date.now() - (this.update.checkedAt ?? 0) > 20e3) this.checkUpdate().catch(() => {})}
  // every 2 minutes and on opening the page: GitHub answers "nothing new" (304) free of its hourly limit, so checking often costs nothing
  releasesEtag?: string; releases: any[] = [];
  async checkUpdate() {
    const response = await fetch("https://api.github.com/repos/hazymat/swarm2mqtt/releases?per_page=30", {headers: Object.assign({accept: "application/vnd.github+json", "user-agent": "Swarm2MQTT"}, this.releasesEtag ? {"if-none-match": this.releasesEtag} : {}) as Record<string, string>});
    if (response.status === 304 && this.releases.length) {} else if (!response.ok) throw new Error("Couldn't reach GitHub to check for updates."); else {this.releases = await response.json(); this.releasesEtag = response.headers.get("etag") ?? undefined}
    const releases = this.releases, chosen = this.store.get<Partial<Prefs>>("prefs", {}).updateChannel;
    const channel = chosen ?? (releases.find(release => release.tag_name === "v" + VERSION)?.prerelease ? "dev" : "stable");
    const newest = releases.filter(release => !release.draft && (channel === "dev" || !release.prerelease))[0], latest = newest?.tag_name?.replace(/^v/, "");
    this.update = {latest, available: !!latest && newerThan(latest, VERSION), channel, checkedAt: Date.now()};
    this.changed();
    return this.update.available ? latest : null;
  }
  async updateNow() {
    const dir = process.env.SWARM2MQTT_INSTALL_DIR, tag = this.update.latest;
    if (!dir || !existsSync(`${dir}/install.sh`)) throw new Error("Update now works when Swarm2MQTT was installed with the install script.");
    if (!tag || !this.update.available) throw new Error("Check for an update first.");
    this.update.running = true; this.changed();
    this.log("info", `Updating Swarm2MQTT to ${tag}…`);
    const code = await new Promise<number>(resolve => spawn("bash", [`${dir}/install.sh`, "--update", "v" + tag], {stdio: "ignore"}).on("exit", exitCode => resolve(exitCode ?? 1)).on("error", () => resolve(1)));
    // on success it stays "running" until the restart, so the page never offers the update again in between
    if (code !== 0) {this.update.running = false; this.changed(); this.log("warn", "The update didn't finish. Still running the old version."); throw new Error("The update didn't finish. Still running the old version.")}
    this.log("info", `Updated to ${tag}. Restarting.`);
    setTimeout(() => process.exit(75), 500);
  }

  log(level: "info" | "warn" | "bad", text: string, ieee?: string, tech?: string) {const event = this.store.log(level, text, ieee, tech); this.emit("event", event); return event}
  tele() {const devices = this.store.devices().filter(device => device.status === "accepted"), parents = this.parents(), all = new Map(devices.map(device => [device.ieee, device])); return {uptime: Math.round((Date.now() - this.startedAt) / 1000), adapter: this.radioStatus.up ? "up" : "down", devices_online: devices.filter(device => this.healthOf(device, parents, all).online).length, devices_total: devices.length, version: VERSION}}
  // debounced "something changed" so the page redraws once, not per message
  changeTimer?: NodeJS.Timeout;
  changed() {if (!this.changeTimer) this.changeTimer = setTimeout(() => {this.changeTimer = undefined; this.emit("changed")}, 150)}
  snapshot() {
    const devices = this.store.devices(), parents = this.parents(), all = new Map(devices.map(device => [device.ieee, device])), latest = this.store.linksAt();
    return {
      version: VERSION, whatsNew: this.whatsNew, update: this.update, sim: this.sim, radio: this.radioStatus.up || this.sim ? this.radioStatus : Object.assign({}, this.radioStatus, {log: adapterLog.slice(-40)}), mqtt: {connected: this.mqtt.connected, error: this.mqtt.error, settings: Object.assign({}, this.mqttSettings, {password: this.mqttSettings.password ? "••••" : ""})}, prefs: this.prefs, stickSet: !!this.stick || this.sim, stick: this.stick ? {path: this.stick.path, adapter: this.stick.adapter} : null,
      join: {endsAt: this.joinEndsAt, found: this.joinFound, via: this.joinVia},
      // how each recent join went, with the verdict in plain words (names filled in)
      joinReports: Array.from(this.joinWatch.reports.values()).map(report => Object.assign({}, report, {verdict: diagnose(report, ieee => ieee ? this.store.device(ieee)?.name ?? ieee : "the adapter")})),
      devices: devices.map(device => Object.assign({}, device, {gaps: undefined, health: this.healthOf(device, parents, all), parent: parents.get(device.ieee), lqi: latest.links.find(link => link.child === device.ieee)?.lqi, rssi: this.signals.get(device.ieee)?.rssi, firmwareProgress: this.firmwareProgress.get(device.ieee)})),
      stickIeee: this.stickIeee(), links: latest, scan: Object.assign({}, this.scan, {finishedAt: this.scan.finishedAt ?? this.store.get<number | undefined>("lastScan", undefined)}), groups: this.store.groups(), scenes: this.store.scenes(), bindings: this.store.bindings(),
      undo: this.store.undoList(30), changes: this.meshChanges(), backups: this.backups().map(entry => ({name: entry.name, ts: entry.ts, reason: entry.reason})),
    };
  }
  // moments the mesh changed: snapshot times where some device's parent differs from the snapshot before
  meshChanges(): number[] {
    const times = this.store.snapshotTimes(), out: number[] = [];
    let previous = new Map<string, string>();
    for (const ts of times) {const current = new Map(this.store.linksAt(ts).links.map(link => [link.child, link.parent])); if (out.length === 0 && previous.size === 0) out.push(ts); else for (const [child, parent] of current) if (previous.get(child) !== parent) {out.push(ts); break} previous = current}
    return out;
  }
  async stop() {await this.mqtt.stop(); await this.radio?.stop()}
}
export function parseValue(text: string): unknown {try {return JSON.parse(text)} catch {return text}}
