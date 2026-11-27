# Swarm2MQTT

**Zigbee2MQTT, but sensible.**

Every Zigbee device Zigbee2MQTT supports, with a live map that shows what's wrong, errors in plain English, and no YAML.

- Starts with a setup wizard, no config file needed
- Stays up when the Zigbee stick doesn't, showing the last known state
- One screen: network map, device details and controls
- Each device gets its own MQTT topic and message format
- Switch from Zigbee2MQTT without re-pairing anything

Status: first version (0.1), not yet tried on a real network. See [SPEC.md](SPEC.md).

## Install

On a Debian or Ubuntu machine (a small VM is plenty):

```
curl -fsSL https://raw.githubusercontent.com/hazymat/swarm2mqtt/main/scripts/install.sh | sudo bash
```

Then open `http://<machine>:8080`. The setup wizard asks where the stick is, whether you're coming from Zigbee2MQTT, and for your MQTT server. Add `-s -- --dev` after `bash` for the dev channel. Updates afterwards are one button in Settings.

Coming from Zigbee2MQTT: copy its data folder to the new machine, point the wizard at it, and stop Zigbee2MQTT before importing (only one can use the stick). Zigbee2MQTT's folder is only read, so going back is always possible.

## Try it without a stick

```
npm ci && npm run build && npm run sim
```

The simulator makes up a small network and runs time 60x faster, so check-ins and history fill quickly.

## MQTT

- `<base>/<device topic>`: the device's values (one message, one topic per value, or both; set per device)
- `<base>/<device topic>/set` (JSON) or `<base>/<device topic>/<value>/set`: commands in
- `<base>/<device topic>/availability`: `{"state":"online"}` or `offline`, retained
- `<base>/bridge/state`: `{"state":"online"}` or `offline` (last will), retained
- `<base>/bridge/tele`: heartbeat every 60 s by default (uptime, stick, devices online and total)
- `<base>/bridge/event`: devices joining, going quiet, coming back, the stick going down

The base topic is a setting (default `swarm2mqtt`). Set it to `zigbee2mqtt` and existing flows keep working.

Built on [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) and [zigbee-herdsman-converters](https://github.com/Koenkk/zigbee-herdsman-converters) (MIT), the libraries that power Zigbee2MQTT. Licensed GPL-3.0. Not affiliated with the Zigbee2MQTT project.
