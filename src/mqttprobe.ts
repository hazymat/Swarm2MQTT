// Setup's MQTT check: connect, see who's there (any Zigbee2MQTT from its retained bridge messages), then let go
export interface Z2mFound {baseTopic: string; running: boolean; version?: string; adapterPath?: string; adapterType?: "ember" | "zstack"; coordinator?: string}
export async function probeMqtt(server: {url: string; username?: string; password?: string}): Promise<{ms: number; z2m: Z2mFound[]}> {
  if (!/^mqtts?:\/\/|^wss?:\/\//.test(server.url ?? "")) throw new Error("Write the address like mqtt://192.168.1.10:1883.");
  const {default: mqtt} = await import("mqtt"), started = Date.now();
  const client = mqtt.connect(server.url, {username: server.username || undefined, password: server.password || undefined, reconnectPeriod: 0, connectTimeout: 6000});
  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", (error: any) => reject(new Error(/not authori[sz]ed|bad user/i.test(error.message) ? "The MQTT server turned down the user name or password." : /ECONNREFUSED/.test(error.message) ? "Nothing answers at that address and port." : /ENOTFOUND|EAI_AGAIN/.test(error.message) ? "This machine can't find that address." : `Couldn't connect: ${error.message}`)));
      setTimeout(() => reject(new Error("No answer from the MQTT server within 6 seconds.")), 6500);
    });
    const ms = Date.now() - started, found = new Map<string, Z2mFound>();
    const entry = (base: string) => {if (!found.has(base)) found.set(base, {baseTopic: base, running: false}); return found.get(base)!};
    client.on("message", (topic, payload) => {
      const [base, , kind] = topic.split("/"), text = payload.toString();
      let data: any; try {data = JSON.parse(text)} catch {data = text}
      if (kind === "state") entry(base).running = (typeof data === "string" ? data : data?.state) === "online";
      if (kind === "info" && data?.version) {const item = entry(base), serial = data.config?.serial ?? {}; item.version = data.version; item.adapterPath = serial.port; item.adapterType = serial.adapter === "zstack" ? "zstack" : serial.adapter === "ember" || serial.adapter === "ezsp" ? "ember" : undefined; item.coordinator = data.coordinator?.type}
    });
    await new Promise<void>(resolve => client.subscribe(["+/bridge/state", "+/bridge/info"], () => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {ms, z2m: Array.from(found.values()).filter(item => item.version)};
  } finally {client.end(true)}
}
