// Stick check for setup: brief, read-only looks that let go straight away. Nothing is sent to the stick, so Zigbee2MQTT can carry on using it.
import {connect} from "node:net";
import {lookup} from "node:dns/promises";
import {accessSync, constants, existsSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync} from "node:fs";

export interface StickCheck {label: string; result: "ok" | "warn" | "bad"; text: string; fix?: string; suggest?: {path?: string; adapter?: "ember" | "zstack"}}
const EMBER_HINT = /_V2|EFR32|SkyConnect|ZBT-1|Sonoff_Zigbee_3\.0_USB_Dongle_Plus_V2|SLZB-0\dM|Dongle_E/i, ZSTACK_HINT = /CC26|CC13|zzh|Dongle_Plus(?!_V2)|Dongle_P|SLZB-0\d(?!M)/i;

// open a TCP connection and close it at once: proves the address and port without talking to the stick
let connectMs = 0;
function tryPort(host: string, port: number): Promise<"open" | "refused" | "timeout" | string> {
  return new Promise(resolve => {
    const started = Date.now(), socket = connect({host, port}); const done = (outcome: string) => {clearTimeout(timer); connectMs = Date.now() - started; socket.destroy(); resolve(outcome)};
    const timer = setTimeout(() => done("timeout"), 4000);
    socket.once("connect", () => done("open")); socket.once("error", (error: any) => done(error.code === "ECONNREFUSED" ? "refused" : String(error.code ?? error.message)));
  });
}
// the stick's own web page, read only: SMLIGHT sticks say their model and firmware at /ha_info, others in the page title
async function webInfo(host: string): Promise<string | undefined> {
  const get = async (url: string) => {const response = await fetch(url, {signal: AbortSignal.timeout(2500)}); if (!response.ok) throw new Error(String(response.status)); return response.text()};
  try {const info: any = (JSON.parse(await get(`http://${host}/ha_info`)) ?? {}).Info ?? {}; if (info.model) return [info.model, info.zb_version ? `Zigbee firmware ${info.zb_version}` : "", info.sw_version ? `stick software ${info.sw_version}` : ""].filter(Boolean).join(", ")} catch {}
  try {const title = (await get(`http://${host}/`)).match(/<title>([^<]{2,60})<\/title>/i)?.[1]?.trim(); if (title) return title} catch {}
}
async function networkStick(path: string, adapter: string): Promise<StickCheck[]> {
  const checks: StickCheck[] = [], match = path.match(/^tcp:\/\/([^:/]+):(\d+)\/?$/);
  if (!match) return [{label: "Address", result: "bad", text: "That isn't a network address Swarm2MQTT understands.", fix: "Write it like tcp://192.168.1.20:6638: tcp://, the stick's address, a colon, then the port."}];
  const host = match[1], port = Number(match[2]);
  try {const found = await lookup(host); checks.push({label: "Address", result: "ok", text: host === found.address ? `${host} is a valid address.` : `${host} is ${found.address}.`})}
  catch {return [{label: "Address", result: "bad", text: `This machine can't find ${host}.`, fix: "Check the name, or use the stick's IP address instead (its own web page or your router shows it)."}]}
  const outcome = await tryPort(host, port);
  if (outcome === "open") {
    checks.push({label: "Connection", result: "ok", text: `It answers on port ${port}, in ${Math.max(1, connectMs)} ms. Nothing was sent to it, and Swarm2MQTT let go at once.`});
    const info = await webInfo(host);
    checks.unshift({label: "Stick", result: "ok", text: info ? `${info}.` : "A network stick (its web page didn't say which model)."});
    const model = info?.split(",")[0] ?? "";
    if (adapter === "zstack" && /SLZB-\w*M\b/i.test(model)) checks.push({label: "Type", result: "warn", text: `${model} is an Ember stick, not Z-Stack.`, fix: "Switch to Ember.", suggest: {adapter: "ember"}});
    if (adapter === "ember" && /^SLZB-0\d(P\d+)?$/i.test(model)) checks.push({label: "Type", result: "warn", text: `${model} is a Z-Stack stick, not Ember.`, fix: "Switch to Z-Stack.", suggest: {adapter: "zstack"}});
  }
  else if (outcome === "refused") checks.push({label: "Connection", result: "bad", text: `${host} is there, but nothing answers on port ${port}.`, fix: port === 6638 ? "In the stick's own web page, check its Zigbee mode is network (not USB) and the port it shows." : "Check the port in the stick's own web page; it's usually 6638."});
  else if (outcome === "timeout") checks.push({label: "Connection", result: "bad", text: `No answer from ${host} within 4 seconds.`, fix: "Check the stick is powered and on the same network, and that the address is right."});
  else checks.push({label: "Connection", result: "bad", text: `Couldn't reach ${host} (${outcome}).`, fix: "Check the stick is powered and on the same network."});
  if (outcome === "open" && port !== 6638) checks.push({label: "Port", result: "warn", text: `Port ${port} answers, but network sticks usually use 6638.`, fix: "Fine if you set it on purpose."});
  return checks;
}
// which program has the device open, from /proc (read only; other users' programs may be hidden)
function heldBy(device: string): string | undefined {
  for (const pid of readdirSync("/proc").filter(name => /^\d+$/.test(name))) {
    if (Number(pid) === process.pid) continue;
    try {for (const fd of readdirSync(`/proc/${pid}/fd`)) if (readlinkSync(`/proc/${pid}/fd/${fd}`) === device) {const cmd = readlinkSync(`/proc/${pid}/exe`).split("/").pop(); return cmd === "node" ? "a Node program (Zigbee2MQTT?)" : cmd}} catch {}
  }
}
function usbStick(path: string, adapter: string): StickCheck[] {
  const checks: StickCheck[] = [], byId = existsSync("/dev/serial/by-id") ? readdirSync("/dev/serial/by-id").map(name => `/dev/serial/by-id/${name}`) : [];
  if (!existsSync(path)) {
    const suggestion = byId[0];
    return [{label: "Device", result: "bad", text: `There's no ${path} on this machine.`, fix: byId.length ? `Plugged in here: ${byId.join(", ")}.` : "No USB stick shows up here. In a container or virtual machine, the USB device has to be passed through to it first.", suggest: suggestion ? {path: suggestion} : undefined}];
  }
  const real = realpathSync(path);
  if (!statSync(real).isCharacterDevice()) return [{label: "Device", result: "bad", text: `${path} isn't a serial device.`, fix: byId.length ? `Plugged in here: ${byId.join(", ")}.` : undefined}];
  const name = byId.find(candidate => {try {return realpathSync(candidate) === real} catch {return false}});
  // what the USB stick says it is (read from the system, not the stick)
  const sys = `/sys/class/tty/${real.split("/").pop()}/device`, read = (file: string) => {for (const up of ["/..", "/../.."]) try {return readFileSync(`${sys}${up}/${file}`, "utf8").trim()} catch {} return ""};
  const product = [read("manufacturer"), read("product")].filter(Boolean).join(" ");
  if (product) checks.push({label: "Stick", result: "ok", text: `${product}${read("serial") ? `, serial ${read("serial")}` : ""}.`});
  checks.push({label: "Device", result: "ok", text: name && name !== path ? `Found it: ${name.split("/").pop()}.` : `Found ${path}.`});
  if (path.startsWith("/dev/tty") && name) checks.push({label: "Name", result: "warn", text: `${path} can change after a restart if more USB devices are plugged in.`, fix: `Use ${name} instead: it never changes.`, suggest: {path: name}});
  try {accessSync(real, constants.R_OK | constants.W_OK); checks.push({label: "Permission", result: "ok", text: "Swarm2MQTT is allowed to use it."})}
  catch {checks.push({label: "Permission", result: "bad", text: "Swarm2MQTT isn't allowed to use it.", fix: "Run: sudo usermod -aG dialout swarm2mqtt, then sudo systemctl restart swarm2mqtt."})}
  const holder = heldBy(real);
  if (holder) checks.push({label: "In use", result: "warn", text: `It's open in ${holder} right now.`, fix: "Stop that before Swarm2MQTT starts the stick, after the next step."});
  const label = name ?? "";
  if (adapter === "ember" && ZSTACK_HINT.test(label) && !EMBER_HINT.test(label)) checks.push({label: "Type", result: "warn", text: "Its name suggests a Z-Stack stick, not Ember.", fix: "Switch to Z-Stack if that's what it is.", suggest: {adapter: "zstack"}});
  if (adapter === "zstack" && EMBER_HINT.test(label)) checks.push({label: "Type", result: "warn", text: "Its name suggests an Ember stick, not Z-Stack.", fix: "Switch to Ember if that's what it is.", suggest: {adapter: "ember"}});
  return checks;
}
// one line on top: ready to go, or what stops it
export async function checkStick(path: string, adapter: string): Promise<{result: "ok" | "warn" | "bad"; headline: string; checks: StickCheck[]}> {
  const checks = await runChecks(path, adapter), stick = checks.find(check => check.label === "Stick")?.text.replace(/\.$/, ""), bad = checks.find(check => check.result === "bad");
  if (bad) return {result: "bad", headline: bad.label === "Connection" ? "Couldn't connect to the stick" : bad.label === "Permission" ? "Found the stick, but can't use it yet" : "Couldn't find the stick", checks};
  const warned = checks.some(check => check.result === "warn");
  return {result: warned ? "warn" : "ok", headline: `${stick ? `Connected to ${stick.split(",")[0]}` : "Connected to the stick"}${warned ? ", with something to look at" : ", ready to go"}`, checks};
}
async function runChecks(path: string, adapter: string): Promise<StickCheck[]> {
  path = path.trim();
  if (/^tcp:\/\//i.test(path) || /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(path)) {
    if (!/^tcp:\/\//i.test(path)) return [{label: "Address", result: "bad", text: "Network sticks need tcp:// in front.", fix: `Use tcp://${path.includes(":") ? path : path + ":6638"}.`, suggest: {path: `tcp://${path.includes(":") ? path : path + ":6638"}`}}];
    return networkStick(path, adapter);
  }
  if (path.startsWith("/")) return usbStick(path, adapter);
  return [{label: "Address", result: "bad", text: "That doesn't look like a stick's address.", fix: "A network stick looks like tcp://192.168.1.20:6638; one plugged in here looks like /dev/ttyUSB0."}];
}
