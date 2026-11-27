// Real adapter, through zigbee-herdsman + zigbee-herdsman-converters (both MIT, by Koen Kanters and the Zigbee2MQTT community)
import {Controller, setLogger, setOtaConfiguration} from "zigbee-herdsman";
import * as zhc from "zigbee-herdsman-converters";
import {Radio, type Control, type Kind, type Link, type RadioDevice} from "./radio.js";

export interface StickConfig {path: string; adapter: "ember" | "zstack"; baudRate?: number; rtscts?: boolean; panId: number; extendedPanId: number[]; channel: number; networkKey: number[]}
const OTA_SETTINGS = {requestTimeout: 150000, responseDelay: 250, baseSize: 50};

// Flatten the library's exposes (lights, switches, composites) into simple controls
export function toControls(exposes: any[], guessed: boolean): Control[] {
  const controls: Control[] = [];
  const walk = (expose: any) => {
    if (expose.features?.length && expose.type !== "composite") {for (const feature of expose.features) walk(feature); return}
    if (!expose.property || controls.some(control => control.property === expose.property)) return;
    const type = expose.type === "binary" || expose.type === "numeric" || expose.type === "enum" ? expose.type : "text";
    controls.push({property: expose.property, label: expose.label ?? expose.name, type, readable: !!(expose.access & 1), writable: !!(expose.access & 2), unit: expose.unit, min: expose.value_min, max: expose.value_max, step: expose.value_step, values: expose.values, on: expose.value_on, off: expose.value_off, setting: expose.category === "config", guessed: guessed || undefined});
  };
  for (const expose of exposes) walk(expose);
  return controls;
}

// What the library says while it talks to the adapter, so "can't connect" comes with the adapter's side of the story. Fine detail only while starting.
export const adapterLog: string[] = [];
let detailed = true;
const keep = (level: string, message: string | (() => string), namespace: string) => {const line = `${new Date().toISOString().slice(11, 19)} ${level} ${namespace.replace(/^zh:/, "")}: ${typeof message === "function" ? message() : message}`, same = (text?: string) => text?.slice(9).replace(/\d+/g, "#"); if (same(adapterLog[adapterLog.length - 1]) === same(line)) adapterLog[adapterLog.length - 1] = line; else adapterLog.push(line); if (adapterLog.length > 200) adapterLog.splice(0, adapterLog.length - 200)};
setLogger({debug: (message, namespace) => {if (detailed) keep("debug", message, namespace)}, info: (message, namespace) => keep("info", message, namespace), warning: (message, namespace) => keep("warn", message, namespace), error: (message, namespace) => keep("error", message, namespace)});
const START_SECONDS = 90;

export class HerdsmanRadio extends Radio {
  controller?: Controller;
  definitions = new Map<string, any>();
  states = new Map<string, Record<string, unknown>>();
  constructor(public config: StickConfig, public dataDir: string) {super()}

  async start() {
    setOtaConfiguration(this.dataDir, undefined);
    const controller = new Controller({
      network: {panID: this.config.panId, extendedPanID: this.config.extendedPanId, channelList: [this.config.channel], networkKey: this.config.networkKey},
      transport: {path: this.config.path, adapter: this.config.adapter, baudRate: this.config.baudRate ?? 115200, rtscts: this.config.rtscts ?? false},
      databasePath: `${this.dataDir}/herdsman.db`, databaseBackupPath: `${this.dataDir}/herdsman.db.backup`, backupPath: `${this.dataDir}/coordinator_backup.json`,
      adapter: {disableLED: false},
      acceptJoiningDeviceHandler: async () => true, // the app holds new devices in "Waiting for you" instead
    });
    this.controller = controller;
    controller.on("adapterDisconnected", () => this.emit("status", {up: false, reason: "Lost the Zigbee adapter."}));
    controller.on("permitJoinChanged", data => this.emit("permitJoin", data.permitted ? data.time ?? 1 : 0));
    controller.on("deviceJoined", data => this.emit("joined", data.device.ieeeAddr));
    controller.on("deviceLeave", data => this.emit("left", data.ieeeAddr));
    controller.on("lastSeenChanged", data => this.emit("heard", data.device.ieeeAddr));
    controller.on("deviceInterview", async data => {
      if (data.status === "successful") {await this.resolve(data.device); await this.configure(data.device)}
      this.emit("interview", data.device.ieeeAddr, data.status);
      this.libraryEvent("deviceInterview", data.device, {status: data.status});
    });
    controller.on("deviceAnnounce", data => this.libraryEvent("deviceAnnounce", data.device));
    controller.on("message", data => this.onMessage(data));
    detailed = true;
    let timer: NodeJS.Timeout | undefined;
    try {await Promise.race([controller.start(), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(`The adapter didn't finish starting within ${START_SECONDS} seconds.`)), START_SECONDS * 1000)})])}
    finally {clearTimeout(timer)}
    detailed = false;
    for (const device of controller.getDevicesIterator(device => device.type !== "Coordinator")) {await this.resolve(device); this.libraryEvent("start", device)}
    const parameters = await controller.getNetworkParameters(), version = await controller.getCoordinatorVersion();
    this.emit("status", {up: true, stick: version.type, channel: parameters.channel, panId: parameters.panID});
  }
  async stop() {try {await this.controller?.stop()} catch {}; this.controller = undefined}

  async resolve(device: any) {
    try {this.definitions.set(device.ieeeAddr, await zhc.findByDevice(device, true))} catch {this.definitions.delete(device.ieeeAddr)}
    return this.definitions.get(device.ieeeAddr);
  }
  async configure(device: any) {
    const definition = this.definitions.get(device.ieeeAddr), coordinator = this.controller!.getDevicesByType("Coordinator")[0];
    if (!definition?.configure || !coordinator) return;
    try {await definition.configure(device, coordinator.getEndpoint(1), definition)} catch (error) {this.emit("state", device.ieeeAddr, {}, undefined)}
  }
  libraryEvent(type: string, device: any, extra: Record<string, unknown> = {}) {
    const data = Object.assign({device, deviceExposesChanged: () => {}, state: this.states.get(device.ieeeAddr) ?? {}, options: {}}, extra);
    Promise.resolve(zhc.onEvent({type, data} as any)).catch(() => {});
  }
  kindOf(device: any): Kind {return device.type === "Coordinator" ? "stick" : device.type === "Router" ? "router" : "battery"}
  describe(device: any): RadioDevice {
    const definition = this.definitions.get(device.ieeeAddr);
    let exposes: any[] = [];
    try {exposes = typeof definition?.exposes === "function" ? definition.exposes(device, {}) : definition?.exposes ?? []} catch {}
    return {ieee: device.ieeeAddr, nwk: device.networkAddress, kind: this.kindOf(device), model: definition?.model ?? device.modelID, vendor: definition?.vendor ?? device.manufacturerName, description: definition?.description, supported: !!definition && !definition.generated, controls: toControls(exposes, !!definition?.generated), interviewing: device.interviewState === "IN_PROGRESS", firmware: device.softwareBuildID};
  }
  list(): RadioDevice[] {return this.controller ? this.controller.getDevices().filter(device => device.type !== "Coordinator").map(device => this.describe(device)) : []}

  async onMessage(message: any) {
    const device = message.device, definition = this.definitions.get(device.ieeeAddr);
    if (!definition) return;
    const state = this.states.get(device.ieeeAddr) ?? {}, payload: Record<string, unknown> = {};
    const publish = (values: Record<string, unknown>) => {Object.assign(state, values); this.emit("state", device.ieeeAddr, values, message.linkquality)};
    for (const converter of definition.fromZigbee ?? []) {
      const types = Array.isArray(converter.type) ? converter.type : [converter.type];
      if (converter.cluster !== message.cluster || !types.includes(message.type)) continue;
      try {const result = await converter.convert(definition, message, publish, {}, {state, device, deviceExposesChanged: () => {}}); if (result) Object.assign(payload, result)} catch {}
    }
    Object.assign(state, payload);
    this.states.set(device.ieeeAddr, state);
    if (Object.keys(payload).length) this.emit("state", device.ieeeAddr, payload, message.linkquality);
  }

  device(ieee: string) {const device = this.controller?.getDeviceByIeeeAddr(ieee); if (!device) throw new Error("Device not found"); return device}
  async set(ieee: string, values: Record<string, unknown>) {
    const device = this.device(ieee), definition = this.definitions.get(ieee);
    if (!definition) throw new Error("No controls known for this device");
    const state = this.states.get(ieee) ?? {}, endpoint = device.getEndpoint(1) ?? device.endpoints[0];
    for (const [key, value] of Object.entries(values)) {
      const converter = definition.toZigbee?.find((candidate: any) => candidate.convertSet && (!candidate.key || candidate.key.includes(key)));
      if (!converter) throw new Error(`"${key}" can't be changed on this device`);
      const meta = {message: values, device, mapped: definition, options: {}, state, endpoint_name: undefined, publish: (payload: Record<string, unknown>) => this.emit("state", ieee, payload), deviceExposesChanged: () => {}};
      const result = await converter.convertSet(endpoint, key, value, meta);
      if (result?.state) {Object.assign(state, result.state); this.emit("state", ieee, result.state)}
    }
    this.states.set(ieee, state);
  }
  async remove(ieee: string) {const device = this.device(ieee); await device.removeFromNetwork(); this.definitions.delete(ieee); this.states.delete(ieee)}
  async permitJoin(seconds: number) {await this.controller!.permitJoin(seconds)}

  // Who talks through whom: each router's neighbour table lists its children; routers hang off the strongest neighbour nearer the adapter
  async scanLinks(): Promise<Link[]> {
    const controller = this.controller!, links: Link[] = [], depth = new Map<string, number>(), routerNeighbours = new Map<string, {ieee: string; lqi: number}[]>();
    const coordinator = controller.getDevicesByType("Coordinator")[0];
    depth.set(coordinator.ieeeAddr, 0);
    for (const router of [coordinator].concat(controller.getDevicesByType("Router"))) {
      let table: any[] = [];
      try {table = await router.lqi()} catch {continue}
      for (const entry of table) {
        if (entry.relationship === 1 && entry.deviceType === 2) links.push({child: entry.eui64, parent: router.ieeeAddr, lqi: entry.lqi});
        if (entry.deviceType === 1 || entry.deviceType === 0) {const list = routerNeighbours.get(entry.eui64) ?? []; list.push({ieee: router.ieeeAddr, lqi: entry.lqi}); routerNeighbours.set(entry.eui64, list); if (entry.depth !== undefined) depth.set(entry.eui64, entry.depth)}
      }
    }
    for (const [routerIeee, neighbours] of routerNeighbours) {
      if (routerIeee === coordinator.ieeeAddr) continue;
      const own = depth.get(routerIeee) ?? 99, nearer = neighbours.filter(neighbour => (depth.get(neighbour.ieee) ?? 99) < own).sort((first, second) => second.lqi - first.lqi);
      const best = nearer[0] ?? neighbours.sort((first, second) => second.lqi - first.lqi)[0];
      if (best) links.push({child: routerIeee, parent: best.ieee, lqi: best.lqi});
    }
    return links;
  }
  target(to: string | number) {return typeof to === "number" ? (this.controller!.getGroupByID(to) ?? this.controller!.createGroup(to)) : this.device(to).getEndpoint(1)}
  async bind(fromIeee: string, to: string | number, unbind = false) {
    const source = this.device(fromIeee), target = this.target(to);
    for (const endpoint of source.endpoints) for (const cluster of ["genOnOff", "genLevelCtrl"]) {
      if (!endpoint.getOutputClusters().some(candidate => candidate.name === cluster)) continue;
      if (unbind) await endpoint.unbind(cluster, target as any); else await endpoint.bind(cluster, target as any);
    }
  }
  async groupAdd(groupId: number, ieee: string, remove = false) {const group = this.controller!.getGroupByID(groupId) ?? this.controller!.createGroup(groupId), endpoint = this.device(ieee).getEndpoint(1)!; if (remove) await endpoint.removeFromGroup(group); else await endpoint.addToGroup(group)}
  async groupSet(groupId: number, values: Record<string, unknown>) {
    const group = this.controller!.getGroupByID(groupId);
    if (!group) throw new Error("Group not found");
    if (values.brightness !== undefined) await group.command("genLevelCtrl", "moveToLevelWithOnOff", {level: Number(values.brightness), transtime: 0, optionsMask: 0, optionsOverride: 0}, {});
    else if (values.state !== undefined) await group.command("genOnOff", String(values.state).toUpperCase() === "ON" ? "on" : "off", {}, {});
  }
  async sceneStore(groupId: number, sceneId: number) {await this.controller!.getGroupByID(groupId)!.command("genScenes", "store", {groupid: groupId, sceneid: sceneId}, {})}
  async sceneRecall(groupId: number, sceneId: number) {await this.controller!.getGroupByID(groupId)!.command("genScenes", "recall", {groupid: groupId, sceneid: sceneId}, {})}
  otaMetas(ieee: string) {const ota = this.definitions.get(ieee)?.ota; return typeof ota === "object" ? ota : {}}
  async checkFirmware(ieee: string) {const result = await this.device(ieee).checkOta({}, undefined, this.otaMetas(ieee)); return result.available}
  async updateFirmware(ieee: string, progress: (percent: number, secondsLeft?: number) => void) {await this.device(ieee).updateOta({}, undefined, undefined, this.otaMetas(ieee), (percent, remaining) => progress(percent, remaining), OTA_SETTINGS)}
  // energy scan isn't exposed by herdsman for every adapter; without it the channel is left to the default list (§12)
  async scanChannels(): Promise<Record<number, number>> {return {}}
}
