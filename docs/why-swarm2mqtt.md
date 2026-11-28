# Why Swarm2MQTT

What Swarm2MQTT does that Zigbee2MQTT doesn't, or does for you where Zigbee2MQTT leaves it to you. Each line is something that has shipped.

## Your network stays safe
- **Never wipes a network.** If its settings don't match the network the adapter holds, it stops and says why, instead of making the adapter leave its network.
- **Moving over from Zigbee2MQTT checks itself.** It takes the network Zigbee2MQTT actually runs, leaves out an old backup of another network, and keeps your base topic so nothing listening breaks.
- **Never stops because of the adapter.** If the adapter can't be reached, the page, MQTT and the last known state stay up while it keeps trying.

## It tells you what's wrong, in plain words
- **Errors in plain words**, each with what to try.
- **A live "getting your network running" checklist** on Home while the adapter isn't up.
- **Offline means offline.** It learns how often each device checks in, so a quiet motion sensor isn't flagged as gone.
- **Signal in dBm**, from the device's own messages, with bars that match.
- **Signal per hop.** For a device that talks through a plug, its page rates each hop and says when the weak link is the plug's own, not the device's.
- **Zigbee2MQTT's old-log pile-up**, which makes its backup fail, is spotted and explained, with the command to clear it.

## A map that stays true
- **Learns routes from normal traffic** (Ember adapters). When a device starts talking through a different plug, the map changes at once, without a check.
- **Keeps the last known route** when a plug misses a check, drawn dashed, and asks that plug again 30 seconds later.
- **Rewind and compare** to see when routes changed.
- **Zoom and pan** with the mouse wheel or by pinching, fitted to your devices.

## Joining and fixing devices
- **New devices wait for you** in "Waiting for you" before anything is published.
- **Finds devices that are on the network but missing from the list**, and adds them.
- **Join diagnostics** for a device that half-joined, in plain words.
- **Remove and add again** in one step: off the network and out of the adapter, even when the device doesn't answer, with what to do next.
- **Move a battery device to another plug**, guided: joining opens on that plug only and the device is asked to come back through it.

## Day to day
- **Plain names for Zigbee jargon**, like Target temperature instead of occupied heating setpoint, with a line on when to change a setting.
- **Every number shows its value** with − and + for exact steps, not a bare slider.
- **Setup wizard**, no config file.
- **Updates show within 2 minutes** and install with one press.
- **A description on every device**, the make and model until you write one, and searchable.
- **Settings in panels**, each with a one-line status; a fault opens its panel.
