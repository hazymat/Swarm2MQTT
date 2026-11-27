// Web page + websocket. The page gets a full snapshot on every change (debounced) and sends commands back.
import {createServer} from "node:http";
import {existsSync, readFileSync, statSync} from "node:fs";
import {extname, join, normalize} from "node:path";
import {randomBytes} from "node:crypto";
import {WebSocketServer, type WebSocket} from "ws";
import type {App} from "./app.js";
import {fetchZ2mBackup, folderFiles, pickFiles, readZ2m, writeZ2mFiles, type Z2mFiles} from "./importz2m.js";
import type {StickConfig} from "./radio/herdsman.js";
import {checkStick} from "./stickcheck.js";
import {clearLeftBehind, probeMqtt} from "./mqttprobe.js";

const TYPES: Record<string, string> = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon"};
const QUIET_CHANNELS = [15, 20, 25];

export function startWeb(app: App, port: number, uiDir: string) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://x");
    if (url.pathname.startsWith("/picture/")) return picture(app, url.pathname.slice(9), response);
    let file = normalize(join(uiDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(uiDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(uiDir, "index.html");
    if (!existsSync(file)) {response.writeHead(500); response.end("The web page wasn't built. Run npm run build."); return}
    response.writeHead(200, {"content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": file.endsWith("index.html") ? "no-cache" : "max-age=31536000"});
    response.end(readFileSync(file));
  });
  const sockets = new WebSocketServer({server, path: "/ws", maxPayload: 64 * 1024 * 1024});
  const send = (socket: WebSocket, message: unknown) => {if (socket.readyState === 1) socket.send(JSON.stringify(message))};
  const all = (message: unknown) => {for (const socket of sockets.clients) send(socket, message)};
  app.on("changed", () => all({t: "snapshot", data: app.snapshot()}));
  app.on("event", event => all({t: "event", event}));
  app.on("toast", toast => all({t: "toast", toast}));
  app.on("rejoin", data => all({t: "rejoin", data}));
  sockets.on("connection", socket => {
    app.checkUpdateSoon();
    send(socket, {t: "snapshot", data: app.snapshot()});
    socket.on("message", async raw => {
      let message: any; try {message = JSON.parse(String(raw))} catch {return}
      try {send(socket, {t: "reply", id: message.id, ok: true, result: await command(app, message.name, message.args ?? {})})}
      catch (error) {send(socket, {t: "reply", id: message.id, ok: false, error: (error as Error).message})}
    });
  });
  server.listen(port, () => console.log(`Swarm2MQTT page on http://localhost:${port}`));
  return server;
}

const z2mSummary = (result: ReturnType<typeof readZ2m>) => ({summary: result.note ? `${result.summary}. ${result.note}` : result.summary, baseTopic: result.mqtt.baseTopic, channel: result.stick.channel, adapterPath: result.stick.path, adapterType: result.stick.adapter, devices: result.devices.map(device => ({ieee: device.ieee, name: device.name, model: device.model, kind: device.kind})), groups: result.groups.map(group => group.name)});
const z2mFiles = (args: any): Z2mFiles => args.files ? pickFiles(args.files) : folderFiles(String(args.folder ?? ""));

async function command(app: App, name: string, args: any): Promise<unknown> {
  switch (name) {
    case "rename": return app.rename(args.ieee, args.name);
    case "note": return app.setNote(args.ieee, args.note);
    case "moveTo": return app.moveTo(args.ieee, args.via);
    case "topic": return app.setTopic(args.ieee, args.topic);
    case "format": return app.setFormat(args.ieee, args.format);
    case "renames": return app.setRenames(args.ieee, args.renames);
    case "set": return app.setValues(args.ieee, args.values);
    case "setting": return app.changeSetting(args.ieee, args.property, args.value);
    case "offlineAfter": return app.setOfflineOverride(args.ieee, args.ms);
    case "hideControl": return app.hideControl(args.ieee, args.property, args.hidden);
    case "addControl": return app.addControl(args.ieee, args.property);
    case "accept": return app.accept(args.ieee);
    case "reject": return app.removeDevice(args.ieee, true);
    case "remove": return app.removeDevice(args.ieee);
    // remove it everywhere, then open joining for it to come back fresh
    case "startAgain": {const result = await app.removeDevice(args.ieee); await app.join(240); return result}
    case "join": return app.join(args.seconds, args.via);
    case "joinAgain": return app.joinAgain(String(args.ieee));
    case "rescan": return app.scanNow();
    case "groupCreate": return app.createGroup(args.name, args.members ?? []);
    case "groupMember": return app.groupMember(args.id, args.ieee, !!args.remove);
    case "groupRename": return app.renameGroup(args.id, args.name);
    case "groupDelete": return app.deleteGroup(args.id);
    case "groupSet": return app.groupSet(args.id, args.values);
    case "sceneSave": return app.saveScene(args.groupId, args.name);
    case "sceneRecall": return app.recallScene(args.id);
    case "sceneDelete": return app.deleteScene(args.id);
    case "bind": return app.bind(args.from, args.to, !!args.remove);
    case "firmwareCheck": return app.checkFirmware(args.ieee);
    case "firmwareUpdate": return app.updateFirmware(args.ieee);
    case "mqtt": {const value = Object.assign({}, args); if (value.password === "••••") delete value.password; return app.setSetting("mqtt", value, "MQTT settings changed")}
    case "prefs": {const result = app.setSetting("prefs", args, args.updateChannel ? `Updates: ${args.updateChannel} channel` : "Settings changed"); if (args.updateChannel) app.checkUpdate().catch(() => {}); return result}
    case "updateCheck": return app.checkUpdate();
    // setup: check the MQTT server and look for Zigbee2MQTT on it; no args = the saved server
    case "mqttProbe": {const server = args.url ? args : app.mqttSettings; if (args.password === "••••") server.password = app.mqttSettings.password; return probeMqtt(server)}
    case "mqttClearLeftBehind": return clearLeftBehind(app.mqttSettings, String(args.baseTopic ?? ""));
    case "adapterRetry": return app.restartRadio();
    case "stickCheck": return checkStick(String(args.path ?? ""), String(args.adapter ?? "ember"));
    case "whatsNewSeen": return app.markWhatsNewSeen(Number(args.id));
    case "updateNow": return app.updateNow();
    case "undo": return app.undo();
    case "redo": return app.redo();
    case "events": return app.store.events(args.before, args.limit ?? 200, args.ieee);
    case "history": return app.store.history(args.ieee, args.key, args.since);
    case "topology": return app.store.linksAt(args.ts);
    case "linkHistory": return app.store.linkHistory(args.ieee);
    case "backups": return app.backups();
    case "backupNow": return app.backup("by-hand");
    case "restore": return app.restore(args.name);
    // Zigbee2MQTT data comes as the files from its backup zip (unzipped in the browser), or a folder on this machine
    case "z2mPreview": return z2mSummary(readZ2m(z2mFiles(args)));
    // ask the running Zigbee2MQTT for its backup over MQTT; the files go back to the page for the import
    case "z2mFetch": {const files = await fetchZ2mBackup(args.mqtt?.url ? args.mqtt : app.mqttSettings, args.baseTopic || "zigbee2mqtt"); return Object.assign({files}, z2mSummary(readZ2m(files)))}
    case "z2mImport": {
      const files = z2mFiles(args), result = readZ2m(files);
      // the adapter typed in the wizard (or the one already set up) wins over Zigbee2MQTT's own setting
      result.stick.path = args.path || app.stick?.path || result.stick.path; result.stick.adapter = args.adapter || app.stick?.adapter || result.stick.adapter;
      app.backup("before-import");
      writeZ2mFiles(files, app.dataDir);
      // devices left unticked wait in "Waiting for you" (sending nothing) instead of being dropped from the network
      const chosen: string[] | undefined = args.devices;
      for (const device of result.devices) if (!app.store.device(device.ieee)) app.store.saveDevice(chosen && !chosen.includes(device.ieee) ? Object.assign(device, {status: "waiting"}) : device);
      for (const group of result.groups) app.store.saveGroup(group);
      // the MQTT server set up here wins over the one in Zigbee2MQTT's settings (that may be "localhost" on its own machine); its topic carries over
      const mqttServer = args.mqtt?.url ? {url: args.mqtt.url, username: args.mqtt.username ?? "", password: args.mqtt.password ?? ""} : app.mqttSettings.url ? {} : {url: result.mqtt.url, username: result.mqtt.username, password: result.mqtt.password};
      app.applySetting("mqtt", Object.assign({}, app.store.get("mqtt", {}), mqttServer, args.keepBaseTopic ? {baseTopic: result.mqtt.baseTopic} : {}));
      app.log("info", `Brought over from Zigbee2MQTT: ${result.summary}. Its own files weren't changed.`);
      app.applySetting("stick", result.stick);
      return result.summary;
    }
    case "newNetwork": {
      // new network: fresh keys (never shown) and a channel between the usual WiFi channels
      const scan = app.radio ? await app.radio.scanChannels().catch(() => ({})) : {};
      const measured = QUIET_CHANNELS.filter(channel => (scan as any)[channel] !== undefined).sort((first, second) => (scan as any)[first] - (scan as any)[second]);
      const stick: StickConfig = {path: args.path, adapter: args.adapter, panId: randomBytes(2).readUInt16BE() % 0xfff0 + 1, extendedPanId: Array.from(randomBytes(8)), channel: args.channel ?? measured[0] ?? 20, networkKey: Array.from(randomBytes(16)), formNew: true};
      app.backup("before-new-network");
      app.applySetting("stick", stick);
      app.log("info", `New Zigbee network made on channel ${stick.channel}.`);
      return {channel: stick.channel};
    }
    case "stickPath": {const stick = app.stick; if (!stick) throw new Error("No adapter set up yet."); app.applySetting("stick", Object.assign({}, stick, {path: args.path, adapter: args.adapter ?? stick.adapter})); return}
    case "channel": {const stick = app.stick; if (!stick) throw new Error("No adapter set up yet."); app.backup("before-channel"); app.applySetting("stick", Object.assign({}, stick, {channel: args.channel})); app.log("warn", `Channel changed to ${args.channel}. Some devices may need to rejoin.`); return}
    default: throw new Error(`Unknown command ${name}`);
  }
}

// Device pictures: fetched from zigbee2mqtt.io the first time, then served from the local cache (never bundled)
async function picture(app: App, model: string, response: import("node:http").ServerResponse) {
  const safe = model.replace(/[^A-Za-z0-9._-]/g, "_"), file = `${app.dataDir}/pictures/${safe}.png`;
  if (existsSync(file)) {response.writeHead(200, {"content-type": "image/png", "cache-control": "max-age=2592000"}); response.end(readFileSync(file)); return}
  try {
    const result = await fetch(`https://www.zigbee2mqtt.io/images/devices/${encodeURIComponent(model.replace(/\//g, "-"))}.png`);
    if (!result.ok) throw new Error(String(result.status));
    const bytes = Buffer.from(await result.arrayBuffer());
    const {mkdirSync, writeFileSync} = await import("node:fs");
    mkdirSync(`${app.dataDir}/pictures`, {recursive: true}); writeFileSync(file, bytes);
    response.writeHead(200, {"content-type": "image/png", "cache-control": "max-age=2592000"}); response.end(bytes);
  } catch {response.writeHead(404); response.end()}
}
