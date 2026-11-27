// What's new: one entry per change people can see, newest first, ids always increasing.
//   text  one plain line: what changed and where
//   go    page for Show me; at  the element that pulses (no at: no Show me)
export const WHATS_NEW = [
  {id: 27, text: "The network map starts fitted to your devices. Zoom with the mouse wheel or by pinching, drag empty space to move around, and press Fit to go back.", go: "home"},
  {id: 26, text: "Move a battery device to another plug: on its page, Talks through > Move it to… opens joining on that plug only and asks the device to come back through it. Wake it with its button and Activity says when it has moved.", go: "home"},
  {id: 25, text: "Each device has a description you can write, under its name: tap it to edit. Until you do, it shows the make and model. Search finds it, and descriptions come over from Zigbee2MQTT.", go: "home"},
  {id: 24, text: "A device that never finished joining says so, and offers Remove and add again: it's taken off the network and out of the adapter (even if it doesn't answer), then joining opens for it to come back fresh. If it comes back without having been reset, Activity says so.", go: "home"},
  {id: 23, text: "Signal shows in dBm with a plain word (Strong, Fair, Weak) on a device's page, and the bars use how well the adapter hears the device's own messages, not a neighbour's view of it.", go: "home"},
  {id: 22, text: "Setup from Zigbee2MQTT says it keeps Zigbee2MQTT's MQTT topic, so whatever listens carries on, and that you can change it later in Settings > MQTT."},
  {id: 21, text: "Settings is now a set of panels: each shows how it stands at a glance and opens with a tap. One with a problem opens by itself.", go: "settings"},
  {id: 20, text: "Devices already on your network that Swarm2MQTT didn't know about (for example ones missing from Zigbee2MQTT's list) are found when they're heard, set up, and wait for you in Waiting for you.", go: "home"},
  {id: 19, text: "Adding devices: each new device shows its steps (joined, got the key, said what it is, make and model, ready), its signal in dBm, and if it stops, why and what to do. Swarm2MQTT retries by itself each time it hears from it.", go: "home"},
  {id: 18, text: "Join near: open joining on one plugged-in device, so a device you can't move (like a radiator valve) joins through the plug nearest to it.", go: "home"},
  {id: 17, text: "The network map shows its check as it runs (which device it's asking, who didn't answer), and devices that haven't checked in since the start say \"Checking in\" instead of \"never\".", go: "home"},
  {id: 16, text: "Safer move from Zigbee2MQTT: the network is taken exactly as Zigbee2MQTT runs it and checked against what it reports live; an old coordinator backup from another adapter is left out. Swarm2MQTT never makes an adapter leave its network unless you asked for a new one, and always lets go of the adapter after a failed start."},
  {id: 15, text: "While the network isn't running, Home shows a live checklist: MQTT, Zigbee2MQTT stopped, the adapter (with the reason it can't connect and what to try) and what the adapter said. Setup now waits on a Start step until the network is really running."},
  {id: 14, text: "Errors say what happened in plain words, never \"Something went wrong\". Connecting to the adapter is blue, not red; tap it to see what's going on."},
  {id: 13, text: "Setup warns about Zigbee2MQTT's old logs, which can stop it making a backup, and gives you the command to clear them. The adapter step is now a guided 1, 2, 3."},
  {id: 12, text: "Addresses come in parts now, so there's nothing to remember: pick mqtt:// or mqtts:// (or Network or USB for the adapter), type the IP address, and the port is already filled in (1883, 8883 or 6638). Pasting a whole address splits it up for you.", go: "settings", at: "#mqtt-server"},
  {id: 11, text: "Setup: getting your network from Zigbee2MQTT waits up to 2 minutes with a running count. If it fails, the page keeps saying why, including what Zigbee2MQTT said, with Try again. Each step ends with one tidy row: Back on the left, the next action on the right. Problem pills now stay 12 seconds and have ✕."},
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
