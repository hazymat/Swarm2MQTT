// Read a Zigbee2MQTT data folder (never written to): network, devices, names, groups. Devices stay paired.
import {copyFileSync, existsSync, readFileSync} from "node:fs";
import {parse} from "yaml";
import type {StickConfig} from "./radio/herdsman.js";
import type {DeviceRow, GroupRow} from "./store.js";
import type {MqttSettings} from "./mqtt.js";

export interface Z2mImport {stick: StickConfig; devices: DeviceRow[]; groups: GroupRow[]; mqtt: Partial<MqttSettings>; summary: string}
const hexToBytes = (hex: string) => (hex.match(/../g) ?? []).map(pair => parseInt(pair, 16));

export function readZ2m(folder: string): Z2mImport {
  folder = folder.replace(/\/+$/, "");
  if (!existsSync(`${folder}/configuration.yaml`)) throw new Error(`No configuration.yaml in ${folder}. Point at Zigbee2MQTT's data folder.`);
  if (!existsSync(`${folder}/database.db`)) throw new Error(`No database.db in ${folder}, so there are no paired devices to bring over.`);
  const config: any = parse(readFileSync(`${folder}/configuration.yaml`, "utf8")) ?? {};
  const backup: any = existsSync(`${folder}/coordinator_backup.json`) ? JSON.parse(readFileSync(`${folder}/coordinator_backup.json`, "utf8")) : {};
  const advanced = config.advanced ?? {}, serial = config.serial ?? {};
  const networkKey = Array.isArray(advanced.network_key) ? advanced.network_key : backup.network_key?.key ? hexToBytes(backup.network_key.key) : undefined;
  const panId = typeof advanced.pan_id === "number" ? advanced.pan_id : backup.pan_id ? parseInt(backup.pan_id, 16) : undefined;
  const extendedPanId = Array.isArray(advanced.ext_pan_id) ? advanced.ext_pan_id : backup.extended_pan_id ? hexToBytes(backup.extended_pan_id) : [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd];
  const channel = advanced.channel ?? backup.channel ?? 11;
  if (!networkKey || panId === undefined) throw new Error("Couldn't find the network key in Zigbee2MQTT's files. Start Zigbee2MQTT once so it writes them, then try again.");
  const adapter = serial.adapter === "zstack" ? "zstack" : serial.adapter === "ember" || serial.adapter === "ezsp" ? "ember" : undefined;
  if (!adapter) throw new Error(`This stick type (${serial.adapter ?? "not set"}) isn't supported yet. Swarm2MQTT supports Ember and Z-Stack sticks.`);
  const stick: StickConfig = {path: serial.port ?? "", adapter, baudRate: serial.baudrate, rtscts: serial.rtscts, panId, extendedPanId, channel, networkKey};
  const names: Record<string, any> = config.devices ?? {}, now = Date.now(), devices: DeviceRow[] = [];
  for (const line of readFileSync(`${folder}/database.db`, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: any; try {entry = JSON.parse(line)} catch {continue}
    if (!entry.ieeeAddr || entry.type === "Coordinator" || entry.type === "Group") continue;
    const name = names[entry.ieeeAddr]?.friendly_name ?? entry.ieeeAddr;
    devices.push({ieee: entry.ieeeAddr, name, topic: name, format: "json", renames: {}, status: "accepted", kind: entry.type === "Router" ? "router" : "battery", model: entry.modelId, vendor: entry.manufName, supported: true, controls: [], hidden_controls: [], added_at: now, state: {}, gaps: []});
  }
  const groups: GroupRow[] = Object.entries(config.groups ?? {}).map(([id, group]: [string, any]) => ({id: Number(id), name: group.friendly_name ?? `Group ${id}`, topic: group.friendly_name ?? `group_${id}`, members: (group.devices ?? []).map((member: string) => {const ieee = member.split("/")[0]; return devices.find(device => device.name === ieee)?.ieee ?? ieee})}));
  const mqttConfig = config.mqtt ?? {}, mqtt: Partial<MqttSettings> = {url: mqttConfig.server, username: mqttConfig.user, password: mqttConfig.password, baseTopic: mqttConfig.base_topic ?? "zigbee2mqtt"};
  return {stick, devices, groups, mqtt, summary: `${devices.length} devices, ${groups.length} groups, channel ${channel}, ${adapter === "ember" ? "Ember" : "Z-Stack"} stick`};
}
// Copy herdsman's own files into our data folder. The source is only read.
export function copyZ2mFiles(folder: string, dataDir: string) {
  folder = folder.replace(/\/+$/, "");
  copyFileSync(`${folder}/database.db`, `${dataDir}/herdsman.db`);
  if (existsSync(`${folder}/coordinator_backup.json`)) copyFileSync(`${folder}/coordinator_backup.json`, `${dataDir}/coordinator_backup.json`);
}
