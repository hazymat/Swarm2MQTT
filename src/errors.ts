// Error translation (§5): every message names the thing, says what happened, offers one action. Raw text stays in "Technical details".
interface Entry {match: RegExp; text: (name: string) => string; fix?: string}
const TABLE: Entry[] = [
  {match: /HOST_FATAL_ERROR|Failed to start EZSP|Waiting for RSTACK|didn't finish starting within/i, text: () => "The adapter didn't answer Swarm2MQTT's hello. Usually another program (Zigbee2MQTT, ZHA) is still connected to it: only one can use it at a time. Stop that program, or restart the adapter from its web page.", fix: "adapter-busy"},
  {match: /ECONNRESET|socket hang up|EPIPE|Socket closed/i, text: () => "The adapter closed the connection. Usually another program (Zigbee2MQTT, ZHA) is connected to it: only one can use it at a time.", fix: "adapter-busy"},
  {match: /protocol version|EZSP.*not supported|unsupported.*firmware|firmware.*too old/i, text: () => "The adapter's Zigbee firmware is too old for Swarm2MQTT. Update it (SLZB adapters: from its web page), then try again.", fix: "stick-settings"},
  {match: /ASH_NCP_FATAL_ERROR|NCP.*fatal/i, text: () => "The adapter's Zigbee chip reported a fault. Restart the adapter (unplug it, or from its web page), then try again.", fix: "stick-settings"},
  {match: /BROADCAST.*'65532'|clusterId 54\b/i, text: () => "Couldn't tell your routers to accept new devices. Trying again."},
  {match: /'65533'.*profileId 41440|clusterId 33\b/i, text: () => "Couldn't open for battery-free switches. Other devices can still join."},
  {match: /interview failed/i, text: name => `Couldn't finish setting up${name ? " " + name : ""}. Press any button on it to wake it.`, fix: "wake"},
  {match: /ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT.*:\d+|connect ETIMEDOUT/i, text: () => "Can't reach the Zigbee adapter at its network address. Check it's powered and on the network.", fix: "stick-settings"},
  {match: /ENOENT.*tty|No such file.*tty|cannot open|Error: Opening/i, text: () => "Zigbee adapter not found. Check it's plugged in.", fix: "stick-settings"},
  {match: /Failed to connect to the adapter|adapter.*(not|failed).*(start|connect)|startup failed|RESET|ASH/i, text: () => "The Zigbee adapter didn't answer when starting. Trying again.", fix: "stick-settings"},
  {match: /network.*(mismatch|inconsistent)|configuration.*does not match/i, text: () => "The adapter holds a different network than the one saved here. Nothing was changed; check Settings > Zigbee adapter.", fix: "stick-settings"},
  {match: /timeout|no response|did not respond|Delivery failed|MAC_NO_ACK|NWK_NO_ROUTE/i, text: name => `${name || "The device"} didn't answer. If it runs on battery it may be asleep: press its button and try again.`},
  {match: /Device not found/i, text: name => `${name || "That device"} isn't on the network any more.`},
  {match: /can't be changed on this device/i, text: name => `That can't be changed on ${name || "this device"}.`},
];
export function translate(raw: string, name = ""): {text: string; fix?: string; raw: string} {
  for (const entry of TABLE) if (entry.match.test(raw)) return {text: entry.text(name), fix: entry.fix, raw};
  // not one we know yet: say what it said, in its own words, rather than something vague
  const said = raw.split("\n")[0].replace(/^(Error|TypeError):\s*/, "").slice(0, 160);
  return {text: `${name || "The Zigbee adapter"} reported a problem: "${said}".`, raw};
}
