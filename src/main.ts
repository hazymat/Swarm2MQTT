#!/usr/bin/env node
// Swarm2MQTT: Zigbee2MQTT, but sensible.
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const args = process.argv.slice(2), flag = (name: string) => args.includes(`--${name}`), option = (name: string, fallback: string) => {const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : process.env[`SWARM2MQTT_${name.toUpperCase()}`] ?? fallback};
const dataDir = resolve(option("data", "./data")), port = Number(option("port", "8080")), uiDir = resolve(dirname(fileURLToPath(import.meta.url)), "ui");
// the service never exits because of the stick or a library bug: log and carry on
process.on("uncaughtException", error => console.error("Unexpected error (kept running):", error));
process.on("unhandledRejection", error => console.error("Unexpected error (kept running):", error));
// node:sqlite still prints an "experimental" notice; hide just that one
process.removeAllListeners("warning");
process.on("warning", warning => {if (warning.name !== "ExperimentalWarning") console.warn(warning)});
const {App} = await import("./app.js"), {startWeb} = await import("./web.js");
const app = new App(dataDir, flag("sim"));
await app.start();
startWeb(app, port, uiDir);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, async () => {await app.stop().catch(() => {}); process.exit(0)});
