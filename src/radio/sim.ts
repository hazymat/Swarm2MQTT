// Fake stick and devices, so the app runs (and can be shown) without any Zigbee hardware
import {Radio, type Control, type Link, type RadioDevice} from "./radio.js";

const onOff: Control = {property: "state", label: "On/off", type: "binary", writable: true, readable: true, on: "ON", off: "OFF"};
const brightness: Control = {property: "brightness", label: "Brightness", type: "numeric", writable: true, readable: true, min: 0, max: 254};
const power: Control = {property: "power", label: "Power", type: "numeric", writable: false, readable: true, unit: "W"};
const battery: Control = {property: "battery", label: "Battery", type: "numeric", writable: false, readable: true, unit: "%", min: 0, max: 100};
const occupancy: Control = {property: "occupancy", label: "Motion", type: "binary", writable: false, readable: true, on: true, off: false};
const sensitivity: Control = {property: "sensitivity", label: "Sensitivity", type: "enum", writable: true, readable: true, values: ["low", "medium", "high"], setting: true};
const keepTime: Control = {property: "keep_time", label: "Hold for", type: "enum", writable: true, readable: true, values: ["30", "60", "120"], setting: true};
const temperature: Control = {property: "temperature", label: "Temperature", type: "numeric", writable: false, readable: true, unit: "°C"};
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
      make("0x00158d0000000108", "battery", "WSDCGQ11LM", "Aqara", "Temperature and humidity sensor", [temperature, battery], "0x000b57fffe000103", {temperature: 20.5, battery: 56}, 900, 110),
      make("0xa4c1380000000109", "battery", "ZG-204ZL", "Tuya", "Human presence sensor", [occupancy, battery, sensitivity, keepTime], "0xa4c1380000000104", {occupancy: false, battery: 64, sensitivity: "high", keep_time: "60"}, 600, 100),
    ];
  }
  async start() {
    this.emit("status", {up: true, stick: "Simulated stick", channel: 20, panId: 0x1a62});
    // speed up time 60x so check-ins show quickly: a device that reports every 600 s reports every 10 s
    for (const device of this.devices) this.timers.push(setInterval(() => this.report(device), device.every * 1000 / 60));
    for (const device of this.devices) setTimeout(() => this.report(device), 200);
  }
  report(device: SimDevice) {
    if (device.off || this.cutOff(device)) return;
    if ("occupancy" in device.state) device.state.occupancy = Math.random() < .3;
    if ("temperature" in device.state) device.state.temperature = Math.round((20 + Math.random() * 2) * 10) / 10;
    if ("power" in device.state && device.state.state === "ON") device.state.power = Math.round(Math.random() * 60 * 10) / 10;
    if ("battery" in device.state && Math.random() < .05) device.state.battery = Math.max(0, (device.state.battery as number) - 1);
    this.emit("state", device.ieee, Object.assign({}, device.state), device.lqi);
  }
  cutOff(device: SimDevice): boolean {const parent = this.devices.find(candidate => candidate.ieee === device.parent); return !!parent && (!!parent.off || this.cutOff(parent))}
  async stop() {for (const timer of this.timers) clearInterval(timer); this.timers = []}
  list(): RadioDevice[] {return this.devices.map(device => ({ieee: device.ieee, nwk: device.nwk, kind: device.kind, model: device.model, vendor: device.vendor, description: device.description, supported: device.supported, controls: device.controls, interviewing: device.interviewing, firmware: device.firmware}))}
  async permitJoin(seconds: number) {
    clearTimeout(this.joinTimer);
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
      this.emit("joined", ieee);
      this.emit("interview", ieee, "started");
      setTimeout(() => {device.interviewing = false; this.emit("interview", ieee, "successful"); this.timers.push(setInterval(() => this.report(device), device.every * 1000 / 60)); this.report(device)}, 4000);
    }, 3000);
  }
  async set(ieee: string, values: Record<string, unknown>) {
    const device = this.devices.find(candidate => candidate.ieee === ieee);
    if (!device) throw new Error("Device not found");
    if (device.off || this.cutOff(device)) throw new Error("No response");
    // in the simulator, switching a router plug "off" at the wall is done with the hidden key _power
    if ("_power" in values) {device.off = !values._power; return}
    Object.assign(device.state, values);
    this.emit("state", ieee, Object.assign({}, device.state), device.lqi);
  }
  async remove(ieee: string) {this.devices = this.devices.filter(device => device.ieee !== ieee); this.emit("left", ieee)}
  async scanLinks(): Promise<Link[]> {
    // battery devices sometimes switch router, to show route changes
    for (const device of this.devices) if (device.kind === "battery" && Math.random() < .25) {const routers = this.devices.filter(candidate => candidate.kind === "router" && !candidate.off); if (routers.length) device.parent = routers[Math.floor(Math.random() * routers.length)].ieee}
    return this.devices.filter(device => !device.off && !this.cutOff(device)).map(device => ({child: device.ieee, parent: device.parent, lqi: Math.max(20, Math.min(255, device.lqi + Math.round((Math.random() - .5) * 40)))}));
  }
  async bind() {}
  async groupAdd() {}
  async groupSet(groupId: number, values: Record<string, unknown>) {}
  async sceneStore() {}
  async sceneRecall() {}
  async checkFirmware(ieee: string) {return ieee.endsWith("103")}
  async updateFirmware(ieee: string, progress: (percent: number, secondsLeft?: number) => void) {for (let percent = 0; percent <= 100; percent += 10) {progress(percent, (100 - percent) * 3); await new Promise(resolve => setTimeout(resolve, 400))} const device = this.devices.find(candidate => candidate.ieee === ieee); if (device) device.firmware = "1.0.4"}
  async scanChannels() {return {15: 40, 20: 12, 25: 25}}
}
