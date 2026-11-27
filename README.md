# Swarm2MQTT

**Zigbee2MQTT, but sensible.**

Every Zigbee device Zigbee2MQTT supports, with a live map that shows what's wrong, errors in plain English, and no YAML.

- Starts with a setup wizard, no config file needed
- Stays up when the Zigbee adapter doesn't, showing the last known state
- One screen: network map, device details and controls
- Each device gets its own MQTT topic and message format
- Switch from Zigbee2MQTT without re-pairing anything

[Everything it does that Zigbee2MQTT doesn't](docs/why-swarm2mqtt.md)

## Setup

Any Debian or Ubuntu machine will do: a small virtual machine, or a container (CT) on Proxmox. A container is fine unless your Zigbee adapter has to be plugged into the machine itself; a network adapter (like an SMLIGHT SLZB) just needs an address.

```
curl -fsSL https://raw.githubusercontent.com/hazymat/swarm2mqtt/main/scripts/install.sh | sudo bash
```

Then open `http://<machine>:8080` and follow the setup. Updates are one button in Settings.

Coming from Zigbee2MQTT? Copy its data folder onto the machine, stop Zigbee2MQTT, and choose it during setup. Nothing needs pairing again, and Zigbee2MQTT's folder is never changed.

## Try it without an adapter

```
npm ci && npm run build && npm run sim
```

The simulator makes up a small network and runs time 60x faster, so check-ins and history fill quickly.

## MQTT

- `<base>/<device topic>`: the device's values (one message, one topic per value, or both; set per device)
- `<base>/<device topic>/set` (JSON) or `<base>/<device topic>/<value>/set`: commands in
- `<base>/<device topic>/availability`: `{"state":"online"}` or `offline`, retained
- `<base>/bridge/state`: `{"state":"online"}` or `offline` (last will), retained
- `<base>/bridge/tele`: heartbeat every 60 s by default (uptime, adapter, devices online and total)
- `<base>/bridge/event`: devices joining, going quiet, coming back, the adapter going down

The base topic is a setting (default `swarm2mqtt`). Set it to `zigbee2mqtt` and existing flows keep working.

Built on [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) and [zigbee-herdsman-converters](https://github.com/Koenkk/zigbee-herdsman-converters) (MIT), the libraries that power Zigbee2MQTT. Licensed GPL-3.0. Not affiliated with the Zigbee2MQTT project.
