// Fake adapter and devices, so the app runs (and can be shown) without any Zigbee hardware
import {Radio, type ReportLevel, type Reporting, type Control, type Link, type RadioDevice, type ScanProgress} from "./radio.js";

const onOff: Control = {property: "state", label: "On/off", help: "On/off state of this light or switch", type: "binary", writable: true, readable: true, on: "ON", off: "OFF"};
const brightness: Control = {property: "brightness", label: "Brightness", help: "Brightness of this light", type: "numeric", writable: true, readable: true, min: 0, max: 254};
const power: Control = {property: "power", label: "Power", help: "Instantaneous measured power", type: "numeric", writable: false, readable: true, unit: "W"};
const battery: Control = {property: "battery", label: "Battery", type: "numeric", writable: false, readable: true, unit: "%", min: 0, max: 100};
const occupancy: Control = {property: "occupancy", label: "Motion", type: "binary", writable: false, readable: true, on: true, off: false};
const sensitivity: Control = {property: "sensitivity", label: "Sensitivity", help: "How sensitive it is to presence", type: "enum", writable: true, readable: true, values: ["low", "medium", "high"], setting: true};
const keepTime: Control = {property: "keep_time", label: "Hold for", help: "Seconds it keeps saying occupied after the last movement", type: "enum", writable: true, readable: true, values: ["30", "60", "120"], setting: true};
const temperature: Control = {property: "temperature", label: "Temperature", type: "numeric", writable: false, readable: true, unit: "°C"};
const humidity: Control = {property: "humidity", label: "Humidity", type: "numeric", writable: false, readable: true, unit: "%"};
const trvControls: Control[] = [{property: "local_temperature", label: "Temperature", help: "Measured at the valve.", type: "numeric", readable: true, writable: false, unit: "°C"}, {property: "occupied_heating_setpoint", label: "Target temperature", type: "numeric", readable: true, writable: true, unit: "°C", min: 4, max: 35, step: 0.5}, {property: "system_mode", label: "Mode", type: "enum", readable: true, writable: true, values: ["off", "auto", "heat"]}, {property: "running_state", label: "Running", type: "enum", readable: true, writable: false, values: ["idle", "heat"]}, {property: "local_temperature_calibration", label: "Temperature correction", help: "The valve sits by the radiator, so it often reads warmer than the room. Lower this if the room ends up cooler than you set.", type: "numeric", readable: true, writable: true, unit: "°C", min: -12.7, max: 12.7, step: 0.2, setting: true}, battery];
const contact: Control = {property: "contact", label: "Closed", type: "binary", writable: false, readable: true, on: true, off: false};

interface SimDevice extends RadioDevice {parent: string; state: Record<string, unknown>; every: number; lqi: number; off?: boolean}
const make = (ieee: string, kind: "router" | "battery", model: string, vendor: string, description: string, controls: Control[], parent: string, state: Record<string, unknown>, every: number, lqi: number): SimDevice => ({ieee, nwk: parseInt(ieee.slice(-4), 16), kind, model, vendor, description, supported: true, controls, interviewing: false, parent, state, every, lqi, firmware: "1.0.3"});

export class SimRadio extends Radio {
  stick = "0x00124b0000000001";
  devices: SimDevice[] = [];
  timers: NodeJS.Timeout[] = [];
  joinTimer?: NodeJS.Timeout;
  joinEnd = 0;
  constructor() {
    super();
    const stick = this.stick;
    this.devices = [
      make("0xa4c1380000000101", "router", "TS011F_plug_1", "Tuya", "Smart plug with power monitoring", [onOff, power], stick, {state: "ON", power: 3.2}, 60, 200),
      make("0xa4c1380000000102", "router", "TS011F_plug_1", "Tuya", "Smart plug with power monitoring", [onOff, power], stick, {state: "ON", power: 41}, 60, 170),
      make("0x000b57fffe000103", "router", "LED1836G9", "IKEA", "TRADFRI bulb E27 806 lumen", [onOff, brightness], stick, {state: "OFF", brightness: 180}, 300, 140),
      make("0xa4c1380000000104", "router", "TS011F_plug_1", "Tuya", "Smart plug with power monitoring", [onOff, power], stick, {state: "ON", power: 0}, 60, 120),
      make("0xa4c1380000000105", "battery", "ZG-204ZL", "Tuya", "Human presence sensor", [occupancy, battery, sensitivity, keepTime], "0xa4c1380000000101", {occupancy: false, battery: 88, sensitivity: "medium", keep_time: "30"}, 600, 180),
      make("0xa4c1380000000106", "battery", "ZG-204ZL", "Tuya", "Human presence sensor", [occupancy, battery, sensitivity, keepTime], "0xa4c1380000000102", {occupancy: false, battery: 4, sensitivity: "medium", keep_time: "30"}, 600, 92),
      make("0x00158d0000000107", "battery", "MCCGQ11LM", "Aqara", "Door and window sensor", [contact, battery], "0xa4c1380000000101", {contact: true, battery: 95}, 3000, 120),
      make("0x00158d0000000108", "battery", "WSDCGQ11LM", "Aqara", "Temperature and humidity sensor", [temperature, humidity, battery], "0x000b57fffe000103", {temperature: 20.5, humidity: 56, battery: 56}, 900, 110),
      make("0xa4c1380000000109", "battery", "ZG-204ZL", "Tuya", "Human presence sensor", [occupancy, battery, sensitivity, keepTime], "0xa4c1380000000104", {occupancy: false, battery: 64, sensitivity: "high", keep_time: "60"}, 600, 100),
      make("0x84fd27fffe00010a", "battery", "TRVZB", "SONOFF", "Zigbee thermostatic radiator valve", trvControls, "0xa4c1380000000102", {local_temperature: 19.4, occupied_heating_setpoint: 21, system_mode: "heat", running_state: "heat", local_temperature_calibration: 0, battery: 79}, 600, 150),
    ];
  }
  async start() {
    this.emit("status", {up: true, stick: "Simulated adapter", channel: 20, panId: 0x1a62});
    // speed up time 60x so check-ins show quickly: a device that reports every 600 s reports every 10 s
    for (const device of this.devices) this.timers.push(setInterval(() => this.report(device), device.every * 1000 / 60));
    for (const device of this.devices) setTimeout(() => this.report(device), 200);
  }
  report(device: SimDevice) {
    if (device.off || this.cutOff(device)) return;
    if ("occupancy" in device.state) device.state.occupancy = Math.random() < .3;
    if ("temperature" in device.state) device.state.temperature = Math.round((20 + Math.random() * 2) * 10) / 10;
    if ("humidity" in device.state) device.state.humidity = Math.round(50 + Math.random() * 10);
    // a valve warms the room towards its target while it heats
    if ("local_temperature" in device.state) {const room = device.state.local_temperature as number, target = device.state.occupied_heating_setpoint as number, heating = device.state.system_mode !== "off" && room < target - .2; device.state.running_state = heating ? "heat" : "idle"; device.state.local_temperature = Math.round((room + (heating ? .3 : -.1) + (Math.random() - .5) * .1) * 10) / 10}
    if ("power" in device.state && device.state.state === "ON") device.state.power = Math.round(Math.random() * 60 * 10) / 10;
    if ("battery" in device.state && Math.random() < .05) device.state.battery = Math.max(0, (device.state.battery as number) - 1);
    this.emit("state", device.ieee, Object.assign({}, device.state), device.lqi);
  }
  cutOff(device: SimDevice): boolean {const parent = this.devices.find(candidate => candidate.ieee === device.parent); return !!parent && (!!parent.off || this.cutOff(parent))}
  async stop() {for (const timer of this.timers) clearInterval(timer); this.timers = []}
  list(): RadioDevice[] {return this.devices.map(device => ({ieee: device.ieee, nwk: device.nwk, kind: device.kind, model: device.model, vendor: device.vendor, description: device.description, supported: device.supported, controls: device.controls, interviewing: device.interviewing, firmware: device.firmware}))}
  joinVia?: string;
  async permitJoin(seconds: number, via?: string | string[]) {
    const one = Array.isArray(via) ? undefined : via === "adapter" ? this.stick : via;
    clearTimeout(this.joinTimer); this.joinVia = seconds ? one : undefined;
    this.joinEnd = seconds ? Date.now() + seconds * 1000 : 0;
    this.emit("permitJoin", seconds);
    if (!seconds) return;
    this.joinTimer = setTimeout(() => this.permitJoin(0), seconds * 1000);
    // a new device turns up a few seconds after opening
    setTimeout(() => {
      if (!this.joinEnd) return;
      const ieee = "0x54ef44" + Math.floor(Math.random() * 0xffffffffff).toString(16).padStart(10, "0");
      const device = make(ieee, "router", "ZBMINIL2", "SONOFF", "Zigbee smart switch (no neutral)", [onOff], this.stick, {state: "OFF"}, 120, 160);
      device.interviewing = true;
      this.devices.push(device);
      this.emit("joined", ieee); this.emit("joinStep", ieee, "joined"); this.emit("interview", ieee, "started");
      const steps = ["secured", "described", "endpoints", "identified"] as const;
      steps.forEach((step, index) => setTimeout(() => {this.emit("signal", ieee, -61, 180); this.emit("delivery", ieee, true); if (step === "secured") this.emit("joinInfo", ieee, {router: true}); this.emit("joinStep", ieee, step)}, 600 * (index + 1)));
      setTimeout(() => {device.interviewing = false; this.emit("joinStep", ieee, "ready"); this.emit("interview", ieee, "successful"); this.timers.push(setInterval(() => this.report(device), device.every * 1000 / 60)); this.report(device)}, 4000);
    }, 3000);
    // and a radiator valve that can't be brought closer: weak signal, so it half-joins (no model yet) until tried again
    setTimeout(() => {
      if (!this.joinEnd) return;
      const ieee = "0x2c1165fffe" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"), via = this.devices.find(candidate => candidate.kind === "router")?.ieee ?? this.stick;
      const device = make(ieee, "battery", "", "", "", [], via, {}, 3600, 22); device.interviewing = true; device.supported = false; device.model = undefined; device.vendor = undefined;
      this.devices.push(device); this.halfJoined.set(ieee, device);
      this.emit("joined", ieee); this.emit("joinInfo", ieee, {parent: via === this.stick ? undefined : via}); this.emit("joinStep", ieee, "joined"); this.emit("interview", ieee, "started");
      setTimeout(() => {this.emit("signal", ieee, -88, 40); this.emit("joinInfo", ieee, {sleepy: true}); this.emit("joinStep", ieee, "secured")}, 900);
      setTimeout(() => {this.emit("signal", ieee, -90, 34); this.emit("joinStep", ieee, "described")}, 1800);
      setTimeout(() => {this.emit("signal", ieee, -89, 36); this.emit("joinStep", ieee, "endpoints")}, 2700);
      setTimeout(() => {this.emit("delivery", ieee, false); this.emit("delivery", ieee, false); this.emit("joinFailed", ieee, "Delivery failed"); device.interviewing = false; this.emit("interview", ieee, "failed")}, 5200);
    }, 5000);
  }
  async set(ieee: string, values: Record<string, unknown>) {
    const device = this.devices.find(candidate => candidate.ieee === ieee);
    if (!device) throw new Error("Device not found");
    if (device.off || this.cutOff(device)) throw new Error("No response");
    // in the simulator, switching a router plug "off" at the wall is done with the hidden key _power
    if ("_power" in values) {device.off = !values._power; return}
    // like real devices: a plug answers within a moment; a battery device takes a few seconds, and first sends one message it had queued with the old value
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)), old = Object.assign({}, device.state);
    if (device.kind === "battery") {await wait(1500); setTimeout(() => this.emit("state", ieee, old, device.lqi), 300); setTimeout(() => {Object.assign(device.state, values); this.emit("state", ieee, Object.assign({}, device.state), device.lqi)}, 4000); return}
    setTimeout(() => {Object.assign(device.state, values); this.emit("state", ieee, Object.assign({}, device.state), device.lqi)}, 400);
  }
  async readBack(ieee: string, keys: string[]) {const device = this.devices.find(candidate => candidate.ieee === ieee); if (device && !device.off && device.kind !== "battery") this.emit("state", ieee, Object.fromEntries(keys.filter(key => key in device.state).map(key => [key, device.state[key]])), device.lqi)}
  async rejoin(ieee: string) {const device = this.devices.find(candidate => candidate.ieee === ieee), via = this.joinVia; if (device && via) setTimeout(() => {device.parent = via; this.emit("joinInfo", ieee, {parent: via}); if (this.halfJoined.has(ieee)) this.reinterview(ieee)}, 3000)}
  async remove(ieee: string) {const answered = !this.halfJoined.has(ieee); this.devices = this.devices.filter(device => device.ieee !== ieee); this.emit("left", ieee); return answered}
  halfJoined = new Map<string, SimDevice>();
  async ping(ieee: string) {const device = this.devices.find(candidate => candidate.ieee === ieee); if (!device || device.off || this.cutOff(device)) throw new Error("No response")}
  // trying the half-joined valve again works: it's identified this time
  async reinterview(ieee: string) {
    const device = this.halfJoined.get(ieee); if (!device) return; this.emit("interview", ieee, "started");
    await new Promise(resolve => setTimeout(resolve, 1500));
    Object.assign(device, {model: "TRVZB", vendor: "SONOFF", description: "Zigbee thermostatic radiator valve", supported: true, controls: trvControls, interviewing: false, state: {local_temperature: 19.5, occupied_heating_setpoint: 20, local_temperature_calibration: -0.1, battery: 100}});
    this.halfJoined.delete(ieee); this.emit("signal", ieee, -79, 96); this.emit("joinStep", ieee, "identified"); this.emit("joinStep", ieee, "ready"); this.emit("interview", ieee, "successful");
  }
  async scanLinks(progress: (step: ScanProgress) => void = () => {}): Promise<Link[]> {
    const routers = [this.stick].concat(this.devices.filter(device => device.kind === "router").map(device => device.ieee)), state: ScanProgress = {done: 0, total: routers.length, answered: [], silent: []};
    for (const ieee of routers) {progress(Object.assign(state, {asking: ieee})); await new Promise(resolve => setTimeout(resolve, 150)); const device = this.devices.find(candidate => candidate.ieee === ieee); if (device && (device.off || this.cutOff(device))) state.silent.push(ieee); else state.answered.push({ieee, hears: this.devices.filter(candidate => candidate.parent === ieee).length}); state.done++}
    progress(Object.assign(state, {asking: undefined}));
    // battery devices sometimes switch router, to show route changes
    for (const device of this.devices) if (device.kind === "battery" && Math.random() < .25) {const routers = this.devices.filter(candidate => candidate.kind === "router" && !candidate.off); if (routers.length) device.parent = routers[Math.floor(Math.random() * routers.length)].ieee}
    return this.devices.filter(device => !device.off && !this.cutOff(device)).map(device => ({child: device.ieee, parent: device.parent, lqi: Math.max(20, Math.min(255, device.lqi + Math.round((Math.random() - .5) * 40)))}));
  }
  async bind() {}
  async groupAdd() {}
  async groupSet(groupId: number, values: Record<string, unknown>) {}
  async sceneStore() {}
  async sceneRecall() {}
  // plugs report power, the climate sensor temperature; the plug ending 104 keeps its own schedule
  canSetReporting(ieee: string) {const device = this.devices.find(candidate => candidate.ieee === ieee); return !!device && ("power" in device.state || "temperature" in device.state)}
  async setReporting(ieee: string, level: ReportLevel): Promise<Reporting[]> {
    const device = this.devices.find(candidate => candidate.ieee === ieee)!; await new Promise(resolve => setTimeout(resolve, device.kind === "battery" ? 5000 : 1200));
    const [min, max] = level === "most" ? [1, 60] : level === "more" ? [5, 300] : [10, 3600], power = "power" in device.state;
    if (ieee.endsWith("104")) return [{name: "Power", ok: false}];
    return [{name: power ? "Power" : "Temperature", ok: true, min, max, change: level === "most" ? "any" : power ? undefined : level === "more" ? "0.1 °C" : "0.5 °C"}];
  }
  async checkFirmware(ieee: string) {const device = this.devices.find(candidate => candidate.ieee === ieee); if (device?.kind === "battery") await new Promise(resolve => setTimeout(resolve, 7000)); /* asleep until its next check-in */ return ieee.endsWith("103") ? true : ieee.endsWith("101") ? null : false}
  async updateFirmware(ieee: string, progress: (percent: number, secondsLeft?: number) => void) {for (let percent = 0; percent <= 100; percent += 10) {progress(percent, (100 - percent) * 3); await new Promise(resolve => setTimeout(resolve, 400))} const device = this.devices.find(candidate => candidate.ieee === ieee); if (device) device.firmware = "1.0.4"}
  async scanChannels() {return {15: 40, 20: 12, 25: 25}}
}
