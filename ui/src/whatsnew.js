// What's new: one entry per change people can see, newest first, ids always increasing.
//   text  one plain line: what changed and where
//   go    page for Show me; at  the element that pulses (no at: no Show me)
export const WHATS_NEW = [
  {id: 4, text: "Your version of Swarm2MQTT now shows in a slim bar along the bottom of every page, setup too. Click it to see What's new again.", at: "#statusbar"},
  {id: 3, text: "Updates: Swarm2MQTT now checks for new versions by itself and shows a bar at the bottom with Update now, on every page including setup.", go: "settings", at: "#updates-card"},
  {id: 2, text: "Bringing a network over from Zigbee2MQTT now takes its backup zip (in Zigbee2MQTT: Settings > Tools > Request Zigbee2MQTT backup) instead of a folder name. Settings, Advanced has it too."},
  {id: 1, text: "Setup: the stick box has a hint for the type of stick you picked, and Coming from Zigbee2MQTT? says plainly what each choice means."},
];
export const LATEST_ID = WHATS_NEW[0].id;
