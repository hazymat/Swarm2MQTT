# Swarm2MQTT

**Zigbee2MQTT, but sensible.**

Every Zigbee device Zigbee2MQTT supports, with a live map that shows what's wrong, errors in plain English, and no YAML.

- Starts with a setup wizard, no config file needed
- Stays up when the Zigbee stick doesn't, showing the last known state
- One screen: network map, device details and controls
- Each device gets its own MQTT topic and message format
- Switch from Zigbee2MQTT without re-pairing anything

Status: spec stage. See [SPEC.md](SPEC.md).

Built on [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) and [zigbee-herdsman-converters](https://github.com/Koenkk/zigbee-herdsman-converters) (MIT), the libraries that power Zigbee2MQTT. Licensed GPL-3.0. Not affiliated with the Zigbee2MQTT project.
