// Setup's MQTT check: connect, see who's there (any Zigbee2MQTT from its retained bridge messages), then let go
// running = it answered a health check just now; a retained "online" alone can be left behind by an old install
export interface Z2mFound {baseTopic: string; running: boolean; answered?: boolean; leftBehind?: boolean; version?: string; adapterPath?: string; adapterType?: "ember" | "zstack"; coordinator?: string}
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
      if (kind === "response" && topic.endsWith("/health_check")) entry(base).answered = true;
      if (kind === "info" && data?.version) {const item = entry(base), serial = data.config?.serial ?? {}; item.version = data.version; item.adapterPath = serial.port; item.adapterType = serial.adapter === "zstack" ? "zstack" : serial.adapter === "ember" || serial.adapter === "ezsp" ? "ember" : undefined; item.coordinator = data.coordinator?.type}
    });
    await new Promise<void>(resolve => client.subscribe(["+/bridge/state", "+/bridge/info", "+/bridge/response/health_check"], () => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1200));
    // ask each one it found whether it's really there
    for (const item of found.values()) if (item.version) client.publish(`${item.baseTopic}/bridge/request/health_check`, "");
    await new Promise(resolve => setTimeout(resolve, 2500));
    const z2m = Array.from(found.values()).filter(item => item.version);
    for (const item of z2m) {item.leftBehind = !item.answered && item.running; item.running = !!item.answered}
    return {ms, z2m: z2m.sort((first, second) => Number(second.running) - Number(first.running))};
  } finally {client.end(true)}
}

// Remove what an old Zigbee2MQTT left behind on the MQTT server: every retained message under its topic
export async function clearLeftBehind(server: {url: string; username?: string; password?: string}, baseTopic: string): Promise<number> {
  if (!/^[\w.-]+$/.test(baseTopic)) throw new Error("That isn't a topic Swarm2MQTT will clear.");
  const {default: mqtt} = await import("mqtt"), client = mqtt.connect(server.url, {username: server.username || undefined, password: server.password || undefined, reconnectPeriod: 0, connectTimeout: 6000});
  try {
    await new Promise<void>((resolve, reject) => {client.once("connect", () => resolve()); client.once("error", reject)});
    const retained = new Set<string>();
    client.on("message", (topic, payload, packet) => {if (packet.retain && payload.length) retained.add(topic)});
    await new Promise<void>(resolve => client.subscribe(`${baseTopic}/#`, () => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1500));
    for (const topic of retained) client.publish(topic, "", {retain: true});
    await new Promise(resolve => setTimeout(resolve, 500));
    return retained.size;
  } finally {client.end()}
}
