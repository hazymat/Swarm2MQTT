// Real adapter, through zigbee-herdsman + zigbee-herdsman-converters (both MIT, by Koen Kanters and the Zigbee2MQTT community)
import {Controller, setLogger, setOtaConfiguration} from "zigbee-herdsman";
import * as zhc from "zigbee-herdsman-converters";
import {createRequire} from "node:module";
import {Radio, type Control, type Kind, type Link, type RadioDevice, type ScanProgress} from "./radio.js";
import {stepFromLog} from "../joinwatch.js";

export interface StickConfig {path: string; adapter: "ember" | "zstack"; baudRate?: number; rtscts?: boolean; panId: number; extendedPanId: number[]; channel: number; networkKey: number[]; formNew?: boolean}
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
// the radio running now, for the library hooks below (one at a time)
let current: HerdsmanRadio | undefined;
const keep = (level: string, message: string | (() => string), namespace: string) => {const line = `${new Date().toISOString().slice(11, 19)} ${level} ${namespace.replace(/^zh:/, "")}: ${typeof message === "function" ? message() : message}`, same = (text?: string) => text?.slice(9).replace(/\d+/g, "#"); if (same(adapterLog[adapterLog.length - 1]) === same(line)) adapterLog[adapterLog.length - 1] = line; else adapterLog.push(line); if (adapterLog.length > 200) adapterLog.splice(0, adapterLog.length - 200)};
// interview steps come as the library's log lines; they're followed even when fine detail is off
const follow = (message: string | (() => string)) => {if (typeof message === "string" && message.startsWith("Interview")) {const found = stepFromLog(message); if (found && current) {if (found.step) current.emit("joinStep", found.ieee, found.step, found.error); else current.emit("joinFailed", found.ieee, found.error)}}};
setLogger({debug: (message, namespace) => {follow(message); if (detailed) keep("debug", message, namespace)}, info: (message, namespace) => keep("info", message, namespace), warning: (message, namespace) => {keep("warn", message, namespace); console.warn(adapterLog[adapterLog.length - 1])}, error: (message, namespace) => {keep("error", message, namespace); console.error(adapterLog[adapterLog.length - 1])}});
const START_SECONDS = 90;

// The library makes an adapter leave whatever network it holds when it isn't the one in our settings, then forms ours. That wipes someone's working network
// if the settings are wrong (a stale backup, a typo). So leaving is only allowed when the person asked for a new network; otherwise starting stops with the reason.
let allowLeave = false;
const {Ezsp} = createRequire(import.meta.url)("zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js"), {Device: LibraryDevice} = createRequire(import.meta.url)("zigbee-herdsman/dist/controller/model/device.js"), Zdo = createRequire(import.meta.url)("zigbee-herdsman/dist/zspec/zdo/index.js");
const ezspLeave = Ezsp.prototype.ezspLeaveNetwork;
Ezsp.prototype.ezspLeaveNetwork = function (...args: unknown[]) {
  if (allowLeave) return ezspLeave.apply(this, args);
  const held = adapterLog.slice().reverse().find(line => line.includes("Current adapter network"))?.match(/"panId":(\d+).*?"radioChannel":(\d+)/);
  throw new Error(`ADAPTER_HOLDS_OTHER_NETWORK${held ? ` pan ${held[1]} channel ${held[2]}` : ""}`);
};
// Ember adapters tell us more while a device joins: signal of every frame (dBm and link quality), whether each message got through, and which router let it in
const ieeeOf = (nwk: number) => current?.controller?.getDeviceByNetworkAddress(nwk)?.ieeeAddr;
const incoming = Ezsp.prototype.ezspIncomingMessageHandler;
Ezsp.prototype.ezspIncomingMessageHandler = function (type: unknown, apsFrame: unknown, packetInfo: any, contents: unknown) {
  try {const ieee = ieeeOf(packetInfo?.senderShortId); if (ieee) current?.emit("signal", ieee, packetInfo.lastHopRssi, packetInfo.lastHopLqi)} catch {}
  return incoming.call(this, type, apsFrame, packetInfo, contents);
};
// Ember adapters run as the network's collection point, so a message that came through plugs is preceded by a note of the path it took ("route record").
// Listening to these keeps the map current with no asking: path = the device, each plug it went through (nearest the device first), then the adapter.
const routeRecord = Ezsp.prototype.ezspIncomingRouteRecordHandler;
Ezsp.prototype.ezspIncomingRouteRecordHandler = function (source: number, sourceEui: string, lastHopLqi: number, lastHopRssi: number, relayCount: number, relayList: number[]) {
  try {
    const coordinator = current?.controller?.getDevicesByType("Coordinator")[0]?.ieeeAddr, relays = (relayList ?? []).map(nwk => ieeeOf(nwk));
    if (coordinator && sourceEui && relays.every(Boolean)) current?.emit("route", [String(sourceEui)].concat(relays as string[], [coordinator]), lastHopLqi);
  } catch {}
  return routeRecord.call(this, source, sourceEui, lastHopLqi, lastHopRssi, relayCount, relayList);
};
const emitEzsp = Ezsp.prototype.emit;
Ezsp.prototype.emit = function (name: string, ...args: any[]) {
  try {
    if (name === "messageSent" && args[1] === 0 /* direct unicast */) {const ieee = ieeeOf(args[2]); if (ieee) current?.emit("delivery", ieee, args[0] === 0)}
    if (name === "trustCenterJoin" && args[2] !== 2 /* not "left" */) {const [, eui64, , decision, parentNwk] = args; current?.emit("joinInfo", String(eui64), {parent: parentNwk === 0 ? undefined : ieeeOf(parentNwk), denied: decision === 2})}
  } catch {}
  return emitEzsp.call(this, name, ...args);
};

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
    this.controller = controller; current = this;
    controller.on("adapterDisconnected", () => this.emit("status", {up: false, reason: "Lost the Zigbee adapter."}));
    controller.on("permitJoinChanged", data => {this.joinOpen = !!data.permitted; this.emit("permitJoin", data.permitted ? data.time ?? 1 : 0)});
    controller.on("deviceJoined", data => this.emit("joined", data.device.ieeeAddr));
    controller.on("deviceLeave", data => this.emit("left", data.ieeeAddr));
    controller.on("lastSeenChanged", data => this.emit("heard", data.device.ieeeAddr));
    controller.on("deviceInterview", async data => {
      if (data.status === "successful") {await this.resolve(data.device); await this.configure(data.device)}
      this.emit("interview", data.device.ieeeAddr, data.status);
      this.libraryEvent("deviceInterview", data.device, {status: data.status});
    });
    controller.on("deviceAnnounce", data => {this.emit("joinStep", data.device.ieeeAddr, "secured"); this.emit("joinInfo", data.device.ieeeAddr, {sleepy: data.device.type === "EndDevice", router: data.device.type === "Router"}); this.libraryEvent("deviceAnnounce", data.device)});
    controller.on("message", data => this.onMessage(data));
    // anything the library hears of by address (an announce, an address answer, its reply when we ask who sent unknown data) may be a stray
    for (const name of ["onIEEEAddress", "onNetworkAddress", "onDeviceAnnounce"]) {const original = (controller as any)[name].bind(controller); (controller as any)[name] = (payload: any) => {this.adopt(payload.eui64, payload.nwkAddress); return original(payload)}}
    detailed = true; allowLeave = !!this.config.formNew;
    let timer: NodeJS.Timeout | undefined;
    try {await Promise.race([controller.start(), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(`The adapter didn't finish starting within ${START_SECONDS} seconds.`)), START_SECONDS * 1000)})])}
    finally {clearTimeout(timer)}
    detailed = false;
    for (const device of controller.getDevicesIterator(device => device.type !== "Coordinator")) {await this.resolve(device); this.libraryEvent("start", device)}
    const parameters = await controller.getNetworkParameters(), version = await controller.getCoordinatorVersion();
    this.emit("status", {up: true, stick: version.type, channel: parameters.channel, panId: parameters.panID});
  }
  // always let go of the adapter, even after a failed start: a network adapter takes one connection, so one left open blocks every retry
  async stop() {
    const controller: any = this.controller; this.controller = undefined; if (!controller) return;
    const within = (promise: Promise<unknown>) => Promise.race([promise.catch(() => {}), new Promise(resolve => setTimeout(resolve, 10000))]);
    await within(controller.stop());
    await within(Promise.resolve().then(() => controller.adapter?.stop?.()));
  }

  async resolve(device: any) {
    try {this.definitions.set(device.ieeeAddr, await zhc.findByDevice(device, true))} catch {this.definitions.delete(device.ieeeAddr)}
    return this.definitions.get(device.ieeeAddr);
  }
  async configure(device: any) {
    const definition = this.definitions.get(device.ieeeAddr), coordinator = this.controller!.getDevicesByType("Coordinator")[0];
    if (!definition?.configure || !coordinator) return;
    try {await definition.configure(device, coordinator.getEndpoint(1), definition)} catch (error) {this.emit("state", device.ieeeAddr, {}, undefined)}
  }
  // A device on our network that the device list doesn't know (lost from Zigbee2MQTT's list, or the list was replaced) is ignored by the library for ever.
  // Whenever one is heard of, it's set up as if it had just joined, and waits in "Waiting for you".
  adopting = new Set<string>(); joinOpen = false;
  adopt(ieee: string, nwk: number) {
    const controller: any = this.controller;
    // one you removed only comes back while joining is open (you're adding it again)
    if (!controller || !ieee || this.adopting.has(ieee) || controller.getDeviceByIeeeAddr(ieee) || (LibraryDevice.byIeeeAddr(ieee, true)?.isDeleted && !this.joinOpen) || /^0x(0{16}|f{16})$/i.test(ieee) || typeof nwk !== "number" || nwk >= 0xfff8) return;
    this.adopting.add(ieee); this.emit("stray", ieee);
    Promise.resolve().then(() => controller.onDeviceJoined({ieeeAddr: ieee, networkAddress: nwk})).catch(() => {}).finally(() => this.adopting.delete(ieee));
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
  async rejoin(ieee: string) {const device = this.device(ieee), adapter: any = (this.controller as any).adapter, clusterId = Zdo.ClusterId.LEAVE_REQUEST; await adapter.sendZdo(device.ieeeAddr, device.networkAddress, clusterId, Zdo.Buffalo.buildRequest(adapter.hasZdoMessageOverhead, clusterId, device.ieeeAddr, Zdo.LeaveRequestFlags.AND_REJOIN), true)}
  // asks it to leave; one that doesn't answer is forgotten anyway (here and in the adapter's list), so the slate is clean either way
  async remove(ieee: string) {const device = this.device(ieee); let answered = true; try {await device.removeFromNetwork()} catch {answered = false; device.removeFromDatabase()} this.definitions.delete(ieee); this.states.delete(ieee); return answered}
  // through one router only (a device that can't be moved, near that router), or anywhere
  async permitJoin(seconds: number, viaIeee?: string) {await this.controller!.permitJoin(seconds, viaIeee ? this.device(viaIeee) : undefined)}
  async reinterview(ieee: string) {
    const device = this.device(ieee); this.emit("interview", ieee, "started");
    try {await device.interview(true); await this.resolve(device); await this.configure(device); this.emit("interview", ieee, "successful")} catch (error) {this.emit("joinFailed", ieee, String((error as Error)?.message ?? error)); this.emit("interview", ieee, "failed")}
  }

  // Who talks through whom: each router's neighbour table lists its children; routers hang off the strongest neighbour nearer the adapter
  async scanLinks(progress: (step: ScanProgress) => void = () => {}): Promise<Link[]> {
    const controller = this.controller!, links: Link[] = [], depth = new Map<string, number>(), routerNeighbours = new Map<string, {ieee: string; lqi: number}[]>();
    const coordinator = controller.getDevicesByType("Coordinator")[0], askList = [coordinator].concat(controller.getDevicesByType("Router"));
    const state: ScanProgress = {done: 0, total: askList.length, answered: [], silent: []};
    depth.set(coordinator.ieeeAddr, 0);
    // one that doesn't answer within 20 s is asked once more 30 s later (just after a restart the network is still settling), so the check always finishes
    const ask = (router: any): Promise<any[]> => Promise.race([router.lqi(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no answer")), 20000))]);
    const read = (router: any, table: any[]) => {
      state.answered.push({ieee: router.ieeeAddr, hears: table.length});
      for (const entry of table) {
        if (!controller.getDeviceByIeeeAddr(entry.eui64)) this.adopt(entry.eui64, entry.nwkAddress);
        if (entry.relationship === 1 && entry.deviceType === 2) links.push({child: entry.eui64, parent: router.ieeeAddr, lqi: entry.lqi});
        if (entry.deviceType === 1 || entry.deviceType === 0) {const list = routerNeighbours.get(entry.eui64) ?? []; list.push({ieee: router.ieeeAddr, lqi: entry.lqi}); routerNeighbours.set(entry.eui64, list); if (entry.depth !== undefined) depth.set(entry.eui64, entry.depth)}
      }
    };
    const retry: any[] = [];
    for (const router of askList) {progress(Object.assign(state, {asking: router.ieeeAddr})); try {read(router, await ask(router))} catch {retry.push(router)} state.done++; progress(state)}
    if (retry.length) {progress(Object.assign(state, {asking: undefined, retrying: true})); await new Promise(resolve => setTimeout(resolve, 30000)); for (const router of retry) {progress(Object.assign(state, {asking: router.ieeeAddr})); try {read(router, await ask(router))} catch {state.silent.push(router.ieeeAddr)}}}
    for (const [routerIeee, neighbours] of routerNeighbours) {
      if (routerIeee === coordinator.ieeeAddr) continue;
      const own = depth.get(routerIeee) ?? 99, nearer = neighbours.filter(neighbour => (depth.get(neighbour.ieee) ?? 99) < own).sort((first, second) => second.lqi - first.lqi);
      const best = nearer[0] ?? neighbours.sort((first, second) => second.lqi - first.lqi)[0];
      if (best) links.push({child: routerIeee, parent: best.ieee, lqi: best.lqi});
    }
    progress(Object.assign(state, {asking: undefined, retrying: undefined}));
    return links;
  }
  async ping(ieee: string) {await this.device(ieee).ping()}
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
