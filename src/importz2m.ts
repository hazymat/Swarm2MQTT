// Read Zigbee2MQTT's data (its backup zip, or its folder; never written to): network, devices, names, groups. Devices stay paired.
import {existsSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {parse} from "yaml";
import type {StickConfig} from "./radio/herdsman.js";
import type {DeviceRow, GroupRow} from "./store.js";
import type {MqttSettings} from "./mqtt.js";

export type Z2mFiles = Record<string, string>; // file name → text, e.g. configuration.yaml, database.db, coordinator_backup.json, secret.yaml
export interface Z2mImport {stick: StickConfig; devices: DeviceRow[]; groups: GroupRow[]; mqtt: Partial<MqttSettings>; summary: string}
const hexToBytes = (hex: string) => (hex.match(/../g) ?? []).map(pair => parseInt(pair, 16));
const WANTED = /^(configuration\.yaml|database\.db|coordinator_backup\.json|[\w.-]+\.yaml)$/;

export function folderFiles(folder: string): Z2mFiles {
  folder = folder.replace(/\/+$/, "");
  if (!existsSync(folder)) throw new Error(`There's no folder ${folder} on this machine.`);
  const files: Z2mFiles = {};
  for (const name of readdirSync(folder)) if (WANTED.test(name)) files[name] = readFileSync(`${folder}/${name}`, "utf8");
  return files;
}
// zip entries can sit inside a folder; keep just the file names we need
export function pickFiles(entries: Z2mFiles): Z2mFiles {const files: Z2mFiles = {}; for (const [path, text] of Object.entries(entries)) {const name = path.split("/").pop()!; if (WANTED.test(name) && !(name in files)) files[name] = text} return files}

export function readZ2m(files: Z2mFiles): Z2mImport {
  if (!files["configuration.yaml"]) throw new Error("That isn't a Zigbee2MQTT backup: there's no configuration.yaml in it.");
  if (!files["database.db"]) throw new Error("There's no database.db in it, so there are no paired devices to bring over.");
  const config: any = parse(files["configuration.yaml"]) ?? {};
  // Zigbee2MQTT can keep values in other files: "!secret.yaml network_key"
  const resolve = (value: any) => {if (typeof value !== "string" || !value.startsWith("!")) return value; const [file, key] = value.slice(1).split(/\s+/); const other = files[file.endsWith(".yaml") ? file : file + ".yaml"]; return other ? (parse(other) ?? {})[key] : undefined};
  const backup: any = files["coordinator_backup.json"] ? JSON.parse(files["coordinator_backup.json"]) : {};
  const advanced = config.advanced ?? {}, serial = config.serial ?? {};
  const keyValue = resolve(advanced.network_key), panValue = resolve(advanced.pan_id), extValue = resolve(advanced.ext_pan_id);
  const networkKey = Array.isArray(keyValue) ? keyValue : backup.network_key?.key ? hexToBytes(backup.network_key.key) : undefined;
  const panId = typeof panValue === "number" ? panValue : backup.pan_id ? parseInt(backup.pan_id, 16) : undefined;
  const extendedPanId = Array.isArray(extValue) ? extValue : backup.extended_pan_id ? hexToBytes(backup.extended_pan_id) : [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd];
  const channel = resolve(advanced.channel) ?? backup.channel ?? 11;
  if (!networkKey || panId === undefined) throw new Error("Couldn't find the network key in Zigbee2MQTT's backup. Start Zigbee2MQTT once so it writes it, then make the backup again.");
  const adapter = serial.adapter === "zstack" ? "zstack" : serial.adapter === "ember" || serial.adapter === "ezsp" ? "ember" : undefined;
  const stick: StickConfig = {path: resolve(serial.port) ?? "", adapter: adapter ?? "ember", baudRate: serial.baudrate, rtscts: serial.rtscts, panId, extendedPanId, channel, networkKey};
  const names: Record<string, any> = config.devices ?? {}, now = Date.now(), devices: DeviceRow[] = [];
  for (const line of files["database.db"].split("\n")) {
    if (!line.trim()) continue;
    let entry: any; try {entry = JSON.parse(line)} catch {continue}
    if (!entry.ieeeAddr || entry.type === "Coordinator" || entry.type === "Group") continue;
    const name = names[entry.ieeeAddr]?.friendly_name ?? entry.ieeeAddr;
    devices.push({ieee: entry.ieeeAddr, name, topic: name, format: "json", renames: {}, status: "accepted", kind: entry.type === "Router" ? "router" : "battery", model: entry.modelId, vendor: entry.manufName, supported: true, controls: [], hidden_controls: [], added_at: now, state: {}, gaps: []});
  }
  const groups: GroupRow[] = Object.entries(config.groups ?? {}).map(([id, group]: [string, any]) => ({id: Number(id), name: group.friendly_name ?? `Group ${id}`, topic: group.friendly_name ?? `group_${id}`, members: (group.devices ?? []).map((member: string) => {const ieee = member.split("/")[0]; return devices.find(device => device.name === ieee)?.ieee ?? ieee})}));
  const mqttConfig = config.mqtt ?? {}, mqtt: Partial<MqttSettings> = {url: resolve(mqttConfig.server), username: resolve(mqttConfig.user), password: resolve(mqttConfig.password), baseTopic: mqttConfig.base_topic ?? "zigbee2mqtt"};
  return {stick, devices, groups, mqtt, summary: `${devices.length} ${devices.length === 1 ? "device" : "devices"}, ${groups.length} ${groups.length === 1 ? "group" : "groups"}, channel ${channel}`};
}
// Write herdsman's own files into our data folder, so the adapter carries on with the same network
export function writeZ2mFiles(files: Z2mFiles, dataDir: string) {
  writeFileSync(`${dataDir}/herdsman.db`, files["database.db"]);
  if (files["coordinator_backup.json"]) writeFileSync(`${dataDir}/coordinator_backup.json`, files["coordinator_backup.json"]);
}
// Ask a running Zigbee2MQTT for its backup over MQTT (what its web page's backup button does): the data folder as a zip.
// Read only: Zigbee2MQTT keeps running and keeps the adapter.
export const BACKUP_WAIT_SECONDS = 120;
export async function fetchZ2mBackup(server: {url: string; username?: string; password?: string}, baseTopic = "zigbee2mqtt"): Promise<Z2mFiles> {
  const {default: mqtt} = await import("mqtt"), {unzipSync} = await import("fflate");
  const client = mqtt.connect(server.url, {username: server.username || undefined, password: server.password || undefined, reconnectPeriod: 0, connectTimeout: 8000});
  // what Zigbee2MQTT logs while it makes the backup, so a failure can say what it said
  const said: string[] = [], answered = {health: false};
  try {
    const zip = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(async () => {
        answered.health = false; client.publish(`${baseTopic}/bridge/request/health_check`, "");
        await new Promise(wait => setTimeout(wait, 3000));
        const heard = said.length ? ` Its last words: "${said.slice(-2).join(" / ")}".` : "";
        reject(new Error(answered.health ? `Zigbee2MQTT is running but didn't send its backup within ${BACKUP_WAIT_SECONDS} seconds.${heard} Its data folder may be very large, or the backup got stuck. Try again, or drop its files instead.` : `Zigbee2MQTT stopped answering while making its backup.${heard} Check it's still running, then try again.`));
      }, BACKUP_WAIT_SECONDS * 1000);
      client.on("error", error => {clearTimeout(timer); reject(new Error(`Couldn't connect to the MQTT server: ${error.message}`))});
      client.on("message", (topic, payload) => {
        let reply: any; try {reply = JSON.parse(payload.toString())} catch {return}
        if (topic.endsWith("/health_check")) {answered.health = true; return}
        if (topic.endsWith("/bridge/logging")) {if (/error|warn/.test(reply.level ?? "") || /backup/i.test(reply.message ?? "")) said.push(String(reply.message).slice(0, 200)); return}
        clearTimeout(timer);
        if (reply.status === "ok" && reply.data?.zip) resolve(reply.data.zip); else reject(new Error(`Zigbee2MQTT couldn't make its backup. It said: "${reply.error ?? "no backup in its answer"}". Try again, or drop its files instead.`));
      });
      client.on("connect", () => client.subscribe([`${baseTopic}/bridge/response/backup`, `${baseTopic}/bridge/response/health_check`, `${baseTopic}/bridge/logging`], () => client.publish(`${baseTopic}/bridge/request/backup`, "")));
    });
    const entries = unzipSync(Buffer.from(zip, "base64"), {filter: entry => WANTED.test(entry.name.split("/").pop() ?? "")}), files: Z2mFiles = {};
    for (const [name, bytes] of Object.entries(entries)) files[name] = Buffer.from(bytes).toString("utf8");
    const picked = pickFiles(files);
    if (!picked["configuration.yaml"] || !picked["database.db"]) throw new Error("Zigbee2MQTT's backup arrived, but without its settings or device list. Drop its files instead.");
    return picked;
  } finally {client.end(true)}
}
