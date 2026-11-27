// What's new: one entry per change people can see, newest first, ids always increasing.
//   text  one plain line: what changed and where
//   go    page for Show me; at  the element that pulses (no at: no Show me)
export const WHATS_NEW = [
  {id: 10, text: "Update now stays on Updating… until the new version is running, then What's new opens. It no longer offers the update again for a moment in between."},
  {id: 9, text: "Setup, MQTT: a Zigbee2MQTT only counts as running if it answers right then. One that doesn't, but left its messages on your MQTT server, shows greyed out as an old install, with Remove its old messages."},
  {id: 8, text: "Boxes that need a format (MQTT server, adapter address, channel) now show it under the box, and it stays there while you type.", go: "settings", at: "#mqtt-server"},
  {id: 7, text: "Setup now starts with your MQTT server, with a green tick once it connects and any Zigbee2MQTT it finds there. Moving over? Swarm2MQTT asks Zigbee2MQTT for its network over MQTT (no files to copy), lists the devices so you can untick any to leave waiting, fills in the adapter, and tells you once Zigbee2MQTT has stopped."},
  {id: 6, text: "Your coordinator is now called the Zigbee adapter everywhere: setup, Settings, the map and messages. In MQTT, bridge/tele's field for it is now called \"adapter\"."},
  {id: 5, text: "Setup: Check the adapter looks at your adapter before you move on: the address or device, the connection, permission, and whether something else has it open. Each problem says how to fix it; Check again, or Carry on anyway. It only takes a quick look and lets go, so Zigbee2MQTT can still use the adapter."},
  {id: 4, text: "Your version of Swarm2MQTT now shows in a slim bar along the bottom of every page, setup too. Click it to see What's new again.", at: "#statusbar"},
  {id: 3, text: "Updates: Swarm2MQTT now checks for new versions by itself and shows a bar at the bottom with Update now, on every page including setup.", go: "settings", at: "#updates-card"},
  {id: 2, text: "Bringing a network over from Zigbee2MQTT now takes its backup zip (in Zigbee2MQTT: Settings > Tools > Request Zigbee2MQTT backup) instead of a folder name. Settings, Advanced has it too."},
  {id: 1, text: "Setup: the adapter box has a hint for the type of adapter you picked, and Coming from Zigbee2MQTT? says plainly what each choice means."},
];
export const LATEST_ID = WHATS_NEW[0].id;
