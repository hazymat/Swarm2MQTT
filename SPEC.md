# Swarm2MQTT: spec (draft 3, 27 Nov 2026)

**Swarm2MQTT**. A replacement for Zigbee2MQTT that you never have to understand Zigbee to use.

**Tagline:** Zigbee2MQTT, but sensible.

**One-line pitch:** Every Zigbee device Zigbee2MQTT supports, with a map that shows what's wrong, errors in plain English, and no YAML.

---

## 1. Promises

Every complaint from Mat's original rant, turned into a requirement. Each has a headline we can use as marketing copy and a check we tick before release. Items marked *(added)* weren't in the rant but follow from "replace Zigbee2MQTT".

### Understand what's wrong

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P1 | **Errors in plain English** | "zh:ember: Delivery of BROADCAST failed for '65532' [apsFrame=…]" | No message shown to the user contains a library prefix, hex, JSON, cluster or profile numbers. Raw text lives only behind "Technical details". |
| P2 | **Every error is about something you can see** | Red and blue toasts floating in a corner with no link to anything | Each problem is pinned to the device, router, stick or setting it's about, and appears there. No background toasts. |
| P3 | **Shows you what's actually wrong** | "Inability to show me what's actually wrong" | Each offline device shows a one-line reason and one fix button (see §5). |
| P4 | **See the knock-on effect** | "If one device goes out and it causes another to go out, show it" | When a router drops, every device that relied on it is drawn as "cut off by Hall plug", not just "offline". |
| P5 | **The map is always there** | Map page is blank with a "Load map" button | Topology scans run in the background. The map opens instantly with the last scan and its age. |
| P6 | **No ghost devices** | Devices last seen months ago, "Unsupported", red Z icon | Devices not heard from for 30 days move to a "Gone quiet" shelf with Remove / Keep. Unsupported devices say what they are and what's missing. |
| P7 | **Repairs itself** | "Inability to repair itself" | Stick reconnects on its own, setup that failed retries on its own, devices that stop reporting are re-told on their own (§4). |
| P8 | **Colours you can explain** | Red and blue toasts at random | Only three status colours, each matching a label on screen: green = fine, amber = needs a look, red = not working. Blue = updates only. |

### One view of everything

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P9 | **Your whole network on one screen** | Devices, Map, Dashboard are three separate pages | Home shows map, device list and the selected device's controls together. |
| P10 | **Control devices from the same place you see them** | State and control buried in a device sub-page | Clicking a device on the map or list opens its panel with live state and controls. |
| P11 | **The details that matter, the rest tucked away** | IEEE address as a main column | List shows picture, name, room, signal, battery, last heard. IEEE, network address, model code sit under "Details". |
| P12 | **Big networks stay readable** | "If there are gazillions of devices this won't work" | Over ~60 devices the map groups by room and expands on click. The list works at any size. |
| P13 | **Pictures of every device** | "I do like the little picture" | Keep device pictures (§8). |

### Never stuck

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P14 | **Works even when the stick doesn't** | UI won't show up when the adapter is unavailable | The UI, settings, logs, last known states and the map all load with the stick unplugged. A banner says "Zigbee stick not found" with what to check. |
| P15 | **Starts with nothing** | Won't start without a hand-written config | First run opens a setup wizard. No file needs to exist. |
| P16 | **No YAML. Ever.** | "Get a comma wrong and nothing works" | Everything is set in the UI. A settings file can be exported and imported for scripting. A broken file never stops startup: bad entries are skipped and listed in Settings. |
| P17 | **Finds your stick for you** | Hand-typing serial ports and adapter types | Wizard lists plugged-in sticks by name, picks the adapter type itself. |

### Made for MQTT

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P18 | **Each device gets its own MQTT topic** | Only possible by putting slashes in its name | Topic is its own field on the device, separate from the display name. |
| P19 | **Choose the message format per device** | Can't shape the JSON or split it into paths | Per device: one JSON message, one topic per value, or both. Optional field renaming. |
| P20 | **MQTT is the first thing in Settings** | MQTT is tab 8 of a sub-sub-menu | MQTT is the first card in Settings. |
| P21 | **Home Assistant keeps working** *(added)* | — | Default topics and Home Assistant discovery match Zigbee2MQTT's, so existing automations don't notice the switch. |

### No jargon

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P22 | **Setup happens by itself** | "Interview" means nothing | No "Interview" button or word. A new device shows "Getting to know Kitchen sensor…" then is ready. Repeats only after a firmware update or if it failed partway. |
| P23 | **No "Reconfigure" button** | "What config? The device has it" | Reporting set-up is redone automatically when a device goes quiet but is still reachable. One "Fix" button covers the rare manual case. |
| P24 | **Adding devices is one obvious button** | "Disable join (All)" with a mystery dropdown | One "Add devices" button. While open, a beacon pulses on the stick and on every listening router, with a countdown and a helper: "Your network key is being handed out. Don't leave this on." |
| P25 | **The UI teaches Zigbee** | "Show me visually or contextually" | Routers, battery devices and the stick have different shapes on the map. Lines show who talks through whom. Hover a term once and it explains itself. |
| P26 | **Groups that make sense** | "What is a group? Why might I want one?" | Groups page leads with "Turn several lights on together, instantly, with no popcorn effect." Creating one starts from selecting devices on the map. |
| P27 | **Four menu items, not fourteen** | Eight top items + cog + sub-tabs + sub-sub-tabs | Home, Groups, Activity, Settings: a sidebar on a computer, a bar at the bottom on a phone. No second row of tabs anywhere. |
| P28 | **Advanced stays out of the way** | Blocklist, adapter delay, extended PAN ID next to everyday settings | Niche options live under one collapsed "Advanced" section at the bottom of Settings. |
| P29 | **Looks like it was designed** | "Crappy looking UI" | Built on the same look and behaviour as Sift and Quizaroo (§3.0). Mockups approved by Mat before any UI is built. |

### Everything you had before

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P30 | **Every device Zigbee2MQTT supports** | "Supports every device under the sun" is Z2M's real strength | Uses the same device library (§8), updated with each of its releases. |
| P31 | **Switch from Zigbee2MQTT without re-pairing** *(added)* | — | Import reads Z2M's data folder and keeps the same network, so every device stays paired. |
| P32 | **You never need to learn Zigbee** | "Zero desire to get my hands dirty" | Mat can install, migrate and run it without reading Zigbee documentation. |

---

## 2. How it's built

```
Browser UI (Svelte)
   │ websocket
Swarm2MQTT service (Node + TypeScript, always running)
   ├─ State store (SQLite): devices, last states, topology history, settings, event log
   ├─ MQTT bridge: per-device topics and formats, HA discovery
   ├─ Health engine: reasons, knock-on effects, automatic repairs
   └─ Radio supervisor ── zigbee-herdsman (talks to the stick)
                          zigbee-herdsman-converters (device library)
```

- **The service never exits because of the stick.** The radio supervisor owns herdsman. If the stick is missing or crashes, the supervisor marks the radio down, retries with backoff, and everything else keeps running. This is the core change from Z2M, which stops when the adapter fails.
- **The store is the source of truth for the UI**, not herdsman's live state. That's what makes P14 possible.
- **Settings live in the store**, edited through the UI. Export/import as JSON (or YAML, same content).
- Runs on Linux (a home server first), later a Docker image and a Home Assistant add-on.
- Same front-end stack and DESIGN.md as WinSqueeze.

**Challenge considered and rejected:** just writing a new front end for Zigbee2MQTT. Z2M does allow custom front ends, but the UI would still vanish when the stick goes (P14), YAML would still exist (P16), per-device formats (P19) need changes inside Z2M. Building on the two libraries Z2M itself uses gets all of that and keeps device support.

---

## 3. Screens

### 3.0 Look and behaviour: the same as Sift and Quizaroo

Swarm2MQTT copies Sift's and Quizaroo's patterns rather than inventing new ones. Where this list is silent, do what Sift's `docs/ui-consistency.md` says.

- **Look:** Quizaroo's Glass theme (and its Light theme): navy gradient, glass cards with soft borders and big rounded corners, pastel tinted pills, light-weight page title with its icon, 👁 View and ⋯ top right, a round + top right (here: Add devices).
- **Frame:** sidebar on a computer (Home, Groups, Activity, Settings at the bottom), each with its own pastel tint when active. On a phone the same four sit in a bar at the bottom, re-ordered by press, hold and drag as in Sift.
- **Undo everything:** every change shows a pill at the bottom with what happened, **Undo**, and a small doughnut that empties as its time runs out. Ctrl+Z / Ctrl+Shift+Z undo and redo after the pill has gone. Activity keeps the whole history, each entry with its own Undo.
- **Changes that reach a device are undone for real:** a rename, room, group, MQTT topic or device setting is put back on the device.
- **Everything can be undone, removing a device included.** While its pill's doughnut runs, nothing has left yet, so Undo is instant. After that (Ctrl+Z or History), Undo can't bring a device back on its own, so it says so and helps: "Kitchen sensor has left the network. To bring it back, put it in pairing mode: hold its button for 5 seconds." Adding devices opens by itself with the beacon and a countdown, the device's own pairing tip is shown, and when that same device rejoins its name, room, groups, MQTT settings and map position come back automatically. If it doesn't appear before the countdown ends: "Didn't hear from it. Try again" with one button.
- **Choosing several:** press and hold a device (in the list or on the map) to choose it: an accent ring around it, and the selection bar rises at the bottom. While any are chosen, a tap adds or removes one; Shift+click a run. Ctrl/⌘+click with a mouse.
- **Selection bar** (Sift's): ✕ Esc first, the count, then actions with their keys: Add to group, Move to room ▸, Fix, Remove D. Toasts stack above it, never under.
- **Dragging:** hold a device row: it wiggles, lifts with a shadow and a slight tilt, the others slide aside, and a dashed slot shows where it lands. The list keeps Your order. On the map, dragging a device moves it and the map remembers where.
- **Keys:** shown on buttons (hidden on touch screens). ↑ ↓ move through the list, Enter opens, Esc closes, / searches, J opens Add devices.
- **Phone:** Home has Map | Devices as underlined tabs. Tapping a device opens its page; swipe sideways to go back.
- **Hints:** first-run callouts with their own ✕ (Sift's `hintHtml`), never paragraphs of help text.

### 3.1 Setup wizard (first run, or Settings > Start again)
1. **Your stick.** Lists plugged-in sticks by name ("Sonoff ZBDongle-E"). One click. "Mine isn't listed" shows unplug/replug hint.
2. **Coming from Zigbee2MQTT?** Yes: point at its folder, we import network, devices, names and rooms (P31). No: create a new network (keys generated, never shown).
3. **MQTT.** Server address, user, password, with a live "Connected" tick. "Skip, I don't use MQTT" allowed.
4. **Done.** Lands on Home with "Add devices" glowing if the network is empty.

### 3.2 Home
- **Left: map.** Stick in the centre, routers as squares, battery devices as circles, lines for "talks through". Line thickness = signal. Problems use the status colours. Drag to rearrange, positions remembered. Toggle to a room layout.
- **Right: list.** Picture, name, room, signal bars, battery, last heard. Sorted problems-first. Search box. Clicking a row highlights it on the map and vice versa.
- **Bottom/side: device panel** for the selected device (3.3).
- **Header:** network status pill ("All good" / "2 need a look"), Add devices button.

### 3.3 Device panel
- Picture, name (click to rename), room.
- **Controls** generated from the device library: switches, sliders, colour, readings.
- **Health line:** "Fine", or the reason and one Fix button (§5).
- **How it connects:** "Talks through Hall plug → stick". Plain words, mirrors the map.
- **MQTT** card: topic, format (§6).
- **Details** (collapsed): IEEE, network address, model code, firmware, raw last message, Remove.
- Firmware update offer appears here when available (replaces Z2M's OTA page).

### 3.4 Add devices
- Button turns into a ring counting down 4 minutes, with a Stop button.
- **Beacon:** while open, the stick and every listening router pulse with expanding rings on the map, and the header pill pulses too, so it's visible from any page. Click a router to stop it listening (replaces the "(All)" dropdown).
- **Helper** under the countdown, always shown while open: "While this is on, any device nearby can join and is handed your network key, including a neighbour's. Turn it off once your device is in."
- Panel text: "Put your device in pairing mode now. Usually: hold the button 5 seconds." Pulls the device-specific tip when known.
- Each new device appears live: "Found a device… Getting to know it… Ready. Name it?"

### 3.5 Groups
Empty state explains with one image and one sentence (P26). Create = select devices on the map, "Make a group". Group gets its own controls and MQTT topic.

### 3.6 Activity
Plain-English timeline ("Kitchen sensor went quiet. Hall plug was switched off at 14:02."). Filter by device. "Technical log" toggle shows the raw log for forum posts, with Copy.

### 3.7 Settings (one page of cards, top to bottom)
1. MQTT
2. Zigbee stick (status, change stick, backup network)
3. Rooms
4. Updates (app and device library)
5. Export / import settings
6. Advanced (collapsed): channel, blocklist/passlist, Touchlink, adapter delay, extended PAN ID, Green Power, network key backup.

---

## 4. Automatic repairs (what replaces the buttons)

| Situation | What Swarm2MQTT does by itself | What the user sees |
|---|---|---|
| Stick unplugged or crashed | Retry every 5 s, then 30 s | Banner, last states greyed with "as of 14:02" |
| New device setup stopped halfway (battery device fell asleep) | Retries next time the device wakes | "Press any button on it to finish setup" |
| Firmware updated | Re-reads what the device can do | Nothing, unless new controls appear |
| Device stopped reporting but answers when asked | Re-sends reporting set-up (Z2M's "reconfigure") | Nothing; Activity notes it |
| Router dropped | Marks dependants "cut off", rescans topology when it returns | Knock-on view (P4) |
| Device silent 30 days | Moves to "Gone quiet" | Remove / Keep |
| Broadcast failed (the red toasts) | Retries once | Only if retry fails: message in the Add devices panel (§5) |

---

## 5. Error translation

Rule: every message names the thing, says what happened in its terms, and offers one action. Raw text under "Technical details".

| Raw (Zigbee2MQTT) | Swarm2MQTT says | Where |
|---|---|---|
| zh:ember: Delivery of BROADCAST failed for '65532' … clusterId 54 | "Couldn't tell your routers to accept new devices. Trying again." | Add devices panel |
| … '65533' profileId 41440 clusterId 33 | "Couldn't open for battery-free switches. Other devices can still join." | Add devices panel |
| Device offline (availability) | "Kitchen sensor hasn't been heard from for 3 hours. Its battery was at 1%." → Replace battery | Device panel, map |
| Device offline, parent router offline | "Cut off: it talks through Hall plug, which is off." → Show Hall plug | Device panel, map |
| Interview failed | "Couldn't finish setting up. Press any button on it to wake it." | Device panel |
| Adapter disconnected | "Zigbee stick not found. Check it's plugged in." | Banner |
| MQTT connect failed | "Can't reach your MQTT server at 10.x.x.x. Wrong password?" | Settings > MQTT, header pill |
| Unsupported device | "We know this is a Tuya device but not which one, so it has no controls yet." → Copy details to request support | Device panel |

The translation table is a file in the repo. Any error without an entry shows "Something went wrong talking to <device>" plus details, and is logged so we can add an entry.

---

## 6. MQTT per device

- **Topic:** defaults to `zigbee2mqtt/<name>` (P21). Editable per device; a global prefix lives in Settings > MQTT.
- **Format**, per device, three choices:
  - One message: `…/kitchen_sensor` → `{"occupancy":true,"battery":80}`
  - One topic per value: `…/kitchen_sensor/occupancy` → `true`
  - Both
- **Rename fields** (optional): table of library name → your name, e.g. `occupancy` → `motion`.
- **Commands in:** same shape accepted on `…/set` (JSON) or `…/<field>/set` (single value).
- Preview box shows exactly what the next message will look like.
- Home Assistant discovery follows whatever the device's format is.

---

## 7. Answers the UI must give without words (from the rant)

- **Coordinator** = the stick. Drawn at the centre of the map, labelled "Stick".
- **Why join turns itself off:** when a device joins, it's handed the network's key, and most devices accept it using a default code everyone knows. While open, a neighbour's bulb in pairing mode can join your network, and someone nearby with a radio could catch the key. Shown as the pulsing beacon and helper in §3.4.
- **Routers vs battery devices:** shape on the map; hover says "Plugged-in devices pass messages on. Battery devices sleep and rely on one."
- **Groups:** one command to many devices at once, so lights change together instead of one by one.

---

## 8. Reused, and credit

- **zigbee-herdsman** and **zigbee-herdsman-converters** (both MIT, maintained by Koen Kanters and the Zigbee2MQTT community). Used as npm dependencies, unmodified. Credited in About and README. Device-support fixes go upstream to converters, not into a private fork.
- **Device pictures** are loaded from zigbee2mqtt.io the first time a device appears, then cached locally so they still show offline. Not bundled in the app or repo (that site's repo is GPL-3.0). A generic shape (plug, bulb, sensor, switch) shows until the picture arrives or if it can't be fetched.
- **Zigbee2MQTT itself** (GPL-3.0): no code copied. Its data-folder format is read for import only.
- Name must not include "zigbee2mqtt".

---

## 9. Not in v1

Extensions/plugins, Touchlink beyond Advanced, multiple sticks, translations (English first, then the usual 16 if it goes public), Docker/HA add-on packaging.

---

## 10. Switching over

No test network: we cut over on Mat's existing stick.
1. Swarm2MQTT imports Z2M's data folder (network key, devices, names) while Z2M is still running. Nothing touches the stick yet.
2. Stop Z2M. Start Swarm2MQTT on the same stick. Devices stay paired.
3. If anything is wrong: stop Swarm2MQTT, start Z2M. Its folder is never written to, so going back always works.

---

## 11. Name: Swarm2MQTT

Chosen by Mat, 27 Nov 2026. Tagline: **"Zigbee2MQTT, but sensible."** Keeps the familiar "2MQTT" pattern; a swarm is both bees and a houseful of devices.

Checked: no GitHub repos, npm free, swarm2mqtt.com/.io/.dev unregistered. Always show the name with the tagline. Never call it a fork or a new version of Zigbee2MQTT.

Rejected: Plainbee, Zigview, Zigherd, ZigMQTT (and any Zig- name), BeeMQTT, Zigbee3MQTT, Zigbee-Loves-MQTT, ZigbeeMQTT.

---

## 12. Open questions

None right now.
