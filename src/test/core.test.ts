import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import mqtt from "mqtt";
import {Aedes} from "aedes";
import {checkIns, batteryDaysLeft, health, FALLBACK_OFFLINE} from "../health.js";
import {payloadsFor, MqttBridge, SENT_KEPT} from "../mqtt.js";
import {readZ2m, folderFiles, pickFiles} from "../importz2m.js";
import {translate} from "../errors.js";
import {App} from "../app.js";
import {stepFromLog} from "../joinwatch.js";
import type {DeviceRow} from "../store.js";

const row = (fields: Partial<DeviceRow>): DeviceRow => Object.assign({ieee: "0x1", name: "Sensor", topic: "sensor", format: "json", renames: {}, status: "accepted", kind: "battery", supported: true, controls: [], hidden_controls: [], added_at: 0, state: {}, gaps: []} as DeviceRow, fields);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 8000) {const end = Date.now() + ms; while (!check()) {if (Date.now() > end) throw new Error("timed out"); await wait(50)}}

test("check-ins: fallback until learnt, then three missed check-ins", () => {
  assert.equal(checkIns(row({gaps: [600e3, 600e3]})).offlineAfterMs, FALLBACK_OFFLINE.battery);
  assert.equal(checkIns(row({gaps: Array(20).fill(30e3)})).source, "fallback"); // a motion burst isn't a rhythm
  const learnt = checkIns(row({gaps: Array(50).fill(3600e3)}));
  assert.equal(learnt.source, "learnt"); assert.equal(learnt.typicalMs, 3600e3); assert.equal(learnt.offlineAfterMs, 3 * 3600e3);
  assert.equal(checkIns(row({gaps: Array(200).fill(600e3)})).offlineAfterMs, 2 * 3600e3); // never sooner than a battery device's floor
  assert.equal(checkIns(row({gaps: Array(20).fill(600e3), offline_after_override: 5000})).offlineAfterMs, 5000);
});
test("battery: predicts days left from a falling trend, none from a flat one", () => {
  const day = 864e5, falling = Array.from({length: 10}, (_, index) => ({ts: index * day, value: 50 - index * 2}));
  assert.ok(Math.abs(batteryDaysLeft(falling)! - 16) < .5);
  assert.equal(batteryDaysLeft(Array.from({length: 10}, (_, index) => ({ts: index * day, value: 80}))), undefined);
  assert.equal(batteryDaysLeft(falling.slice(0, 3)), undefined);
});
test("health: a device behind a silent router is cut off, not just offline", () => {
  const now = Date.now(), device = row({last_seen: now - 30 * 3600e3});
  const result = health(device, now, ieee => ieee === "0x1" ? "0xrouter" : undefined, () => false, () => "Landing plug", [], 21, 10);
  assert.equal(result.status, "bad"); assert.equal(result.cutOffBy, "0xrouter"); assert.match(result.reason!, /Landing plug/);
});
test("MQTT payloads: one message, one topic per value, both, with renamed fields", () => {
  const values = {occupancy: true, battery: 80};
  assert.deepEqual(payloadsFor(row({format: "json"}), values, "base"), [["base/sensor", '{"occupancy":true,"battery":80}']]);
  assert.deepEqual(payloadsFor(row({format: "values", renames: {occupancy: "motion"}}), values, "base"), [["base/sensor/motion", "true"], ["base/sensor/battery", "80"]]);
  assert.equal(payloadsFor(row({format: "both"}), values, "base").length, 3);
});

test("sent over MQTT: the last few messages, newest first, each a copy of what went out", () => {
  const bridge = new MqttBridge(() => ({url: "", baseTopic: "base", heartbeatSeconds: 0, retain: false}), () => {}, () => ({}), () => {}), published: string[] = [];
  const device = row({renames: {occupancy: "motion"}}), state: Record<string, unknown> = {occupancy: false, battery: 80};
  bridge.device(device, state);
  assert.equal(bridge.sent.size, 0, "nothing is recorded while not connected");
  bridge.connected = true; bridge.client = {publish: (topic: string) => {published.push(topic)}} as any;
  for (let step = 0; step < SENT_KEPT + 2; step++) {state.battery = 80 - step; bridge.device(device, state)}
  const sent = bridge.sent.get("0x1")!;
  assert.equal(sent.length, SENT_KEPT);
  assert.equal(sent[0].message.battery, 80 - SENT_KEPT - 1, "newest first");
  assert.equal(sent[0].message.motion, false, "renamed as published");
  assert.equal(sent[0].topic, "base/sensor");
  assert.equal(bridge.lastSent("0x1"), sent[0].ts);
  assert.equal(published.length, SENT_KEPT + 2);
});
test("errors: raw herdsman text becomes plain words", () => {
  assert.match(translate("zh:ember: Delivery of BROADCAST failed for '65532' clusterId 54").text, /routers/);
  assert.match(translate("connect ECONNREFUSED 10.0.0.5:6638").text, /network address/);
  assert.match(translate("weird thing", "Hall plug").text, /Hall plug/);
});
test("Zigbee2MQTT import reads network, names and groups without changing the folder", () => {
  const folder = mkdtempSync(`${tmpdir()}/z2m-`);
  writeFileSync(`${folder}/configuration.yaml`, "mqtt:\n  base_topic: zigbee2mqtt\n  server: mqtt://broker:1883\nserial:\n  port: tcp://stick:6638\n  adapter: ember\nadvanced:\n  network_key: '!secret.yaml network_key'\n  pan_id: 6754\n  channel: 15\ndevices:\n  '0xa1':\n    friendly_name: Kitchen sensor\ngroups:\n  '1':\n    friendly_name: Lights\n    devices: [Kitchen sensor]\n");
  writeFileSync(`${folder}/secret.yaml`, "network_key: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]\n");
  writeFileSync(`${folder}/database.db`, '{"id":1,"type":"Coordinator","ieeeAddr":"0x00"}\n{"id":2,"type":"EndDevice","ieeeAddr":"0xa1","modelId":"TS0202"}\n');
  const result = readZ2m(folderFiles(folder));
  assert.deepEqual(Object.keys(pickFiles({"data/configuration.yaml": "a", "data/log/x.txt": "b"})), ["configuration.yaml"]);
  assert.equal(result.stick.channel, 15); assert.equal(result.stick.adapter, "ember"); assert.equal(result.stick.panId, 6754); assert.equal(result.stick.networkKey.length, 16);
  assert.deepEqual(result.devices.map(device => [device.name, device.topic, device.kind]), [["Kitchen sensor", "Kitchen sensor", "battery"]]);
  assert.deepEqual(result.groups[0].members, ["0xa1"]);
  assert.equal(result.mqtt.baseTopic, "zigbee2mqtt");
});

test("Zigbee2MQTT import: network as Zigbee2MQTT runs it; an old backup of another network is left out; a live mismatch stops it", () => {
  const config = "serial:\n  port: tcp://stick:6638\n  adapter: ember\nadvanced:\n  network_key: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]\n  pan_id: 6754\n";
  const database = '{"id":1,"type":"Coordinator","ieeeAddr":"0x00"}\n';
  const staleBackup = JSON.stringify({pan_id: "1a62", extended_pan_id: "00124b00258cc1a8", network_key: {key: "0102"}});
  const files: Record<string, string> = {"data/configuration.yaml": config, "data/database.db": database, "data/old/coordinator_backup.json": "{}", "data/coordinator_backup.json": staleBackup};
  const picked = pickFiles(files);
  assert.equal(picked["coordinator_backup.json"], staleBackup); // the top-level one, not the copy in a subfolder
  const result = readZ2m(picked);
  assert.deepEqual(result.stick.extendedPanId, [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd]); assert.equal(result.stick.channel, 11);
  assert.equal(picked["coordinator_backup.json"], undefined); assert.match(result.note ?? "", /another network/);
  assert.throws(() => readZ2m({"configuration.yaml": config, "database.db": database, "bridge-info.json": JSON.stringify({network: {pan_id: 6754, channel: 15, extended_pan_id: "0xdddddddddddddddd"}})}), /don't match the network it's running/);
  assert.doesNotThrow(() => readZ2m({"configuration.yaml": config, "database.db": database, "bridge-info.json": JSON.stringify({network: {pan_id: 6754, channel: 11, extended_pan_id: "0xdddddddddddddddd"}})}));
  assert.match(translate("Error: ADAPTER_HOLDS_OTHER_NETWORK pan 1 channel 11").text, /stopped rather than wipe it/);
});

test("end to end with the simulator: MQTT out and in, holding area, undo, heartbeat", {timeout: 60e3}, async () => {
  const broker = await Aedes.createBroker(), server = createServer(broker.handle);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port, url = `mqtt://127.0.0.1:${port}`;
  const app = new App(mkdtempSync(`${tmpdir()}/s2m-`), true);
  app.store.put("mqtt", {url, baseTopic: "s2m", heartbeatSeconds: 1});
  const seen = new Map<string, string>(), watcher = mqtt.connect(url);
  watcher.on("message", (topic, payload) => seen.set(topic, payload.toString()));
  await new Promise(resolve => watcher.on("connect", resolve)); watcher.subscribe("s2m/#");
  await app.start();
  try {
    await until(() => seen.get("s2m/bridge/state") === '{"state":"online"}');
    await until(() => seen.has("s2m/bridge/tele"));
    assert.equal(JSON.parse(seen.get("s2m/bridge/tele")!).adapter, "up");
    await until(() => app.store.devices().length === 10);
    // map: a route note from normal traffic moves a device at once; a plug that misses a check keeps the routes through it, marked as seen earlier
    const stick = (app.radio as any).stick, door = "0x00158d0000000107", climate = "0x00158d0000000108";
    await app.scanNow();
    app.routeSeen([climate, "0xa4c1380000000102", stick], 150);
    assert.equal(app.parents().get(climate), "0xa4c1380000000102");
    await (app.radio as any).set("0xa4c1380000000101", {_power: false}); await app.scanNow();
    const latest = app.store.linksAt(), carried = latest.links.find(link => link.child === "0xa4c1380000000101")!;
    assert.ok(carried && carried.seen < latest.ts, "the plug that didn't answer keeps its last known route");
    const behind = latest.links.find(link => link.child === door)!; // the simulator sometimes moves battery devices: either still behind the silent plug (carried) or freshly seen elsewhere
    assert.ok(behind.parent === "0xa4c1380000000101" ? behind.seen < latest.ts : behind.seen === latest.ts);
    (app.radio as any).devices.find((device: any) => device.ieee === "0xa4c1380000000101").off = false;
    const plug = app.store.device("0xa4c1380000000101")!;
    await until(() => seen.has(`s2m/${plug.topic}`));
    // rename moves the topic; undo puts it back
    await app.rename(plug.ieee, "Hall plug");
    assert.equal(app.store.device(plug.ieee)!.topic, "hall_plug");
    await app.undo();
    assert.equal(app.store.device(plug.ieee)!.topic, plug.topic);
    await app.redo();
    // commands in over MQTT
    watcher.publish("s2m/hall_plug/set", '{"state":"OFF"}');
    await until(() => app.store.device(plug.ieee)!.state.state === "OFF");
    watcher.publish("s2m/hall_plug/state/set", "ON");
    await until(() => app.store.device(plug.ieee)!.state.state === "ON");
    // a change is pending until the device itself reports it; a plug that's off at the wall never confirms
    const pendingSet = app.setValues(plug.ieee, {state: "OFF"});
    assert.equal(app.pending.get(plug.ieee)!.state.phase, "sending"); await pendingSet;
    await until(() => app.pending.get(plug.ieee)?.state?.phase === "set");
    await (app.radio as any).set(plug.ieee, {_power: false});
    await assert.rejects(app.setValues(plug.ieee, {state: "ON"})); assert.equal(app.pending.get(plug.ieee)!.state.phase, "failed");
    (app.radio as any).devices.find((device: any) => device.ieee === plug.ieee).off = false;
    // a new device waits and sends nothing until accepted
    await app.join(60);
    await until(() => app.store.devices().some(device => device.status === "waiting"), 15e3);
    const newcomer = app.store.devices().find(device => device.status === "waiting")!;
    await wait(3000);
    assert.ok(!Array.from(seen.keys()).some(topic => topic === `s2m/${newcomer.topic}`), "waiting device must not publish");
    app.accept(newcomer.ieee);
    await until(() => seen.has(`s2m/${newcomer.topic}`));
    // removing is undone by a guided rejoin that restores the old settings
    await app.rename(newcomer.ieee, "Porch switch");
    await app.removeDevice(newcomer.ieee);
    assert.equal(app.store.device(newcomer.ieee), undefined);
    await app.undo();
    assert.ok(app.rejoinRows.has(newcomer.ieee));
    // heartbeat can be changed and turned off
    app.setSetting("mqtt", {heartbeatSeconds: 0}, "test");
    assert.equal(app.mqttSettings.heartbeatSeconds, 0);
  } finally {
    await app.stop(); watcher.end(true); server.close(); broker.close();
  }
});

test("an adapter that can't be reached never stops the service", {timeout: 30e3}, async () => {
  const app = new App(mkdtempSync(`${tmpdir()}/s2m-`), false);
  app.store.put("stick", {path: "tcp://127.0.0.1:1", adapter: "ember", panId: 1, extendedPanId: [1, 2, 3, 4, 5, 6, 7, 8], channel: 20, networkKey: Array(16).fill(1)});
  await app.start();
  try {
    await until(() => !app.radioStatus.up && !/^(Starting|Connecting)/.test(app.radioStatus.reason ?? ""), 20e3);
    assert.ok(app.retryTimer, "a retry is scheduled");
    assert.ok(app.snapshot().devices, "the page still gets a snapshot");
  } finally {clearTimeout(app.retryTimer); await app.stop().catch(() => {})}
});

test("join steps read from the library's log, in either spelling it uses", () => {
  assert.equal(stepFromLog("Interview - got 'modelId' for device '0x00124b0000000001'")?.step, "identified");
  assert.equal(stepFromLog("Interview - got 'modelID' for device '0x00124b0000000001'")?.step, "identified");
  assert.equal(stepFromLog("Interview - got active endpoints for device '0x00124b0000000001'")?.step, "endpoints");
});
