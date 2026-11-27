# Swarm2MQTT: spec (draft 6, 27 Nov 2026)

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
| P2 | **Every error is about something you can see** | Red and blue toasts floating in a corner with no link to anything | Each problem is pinned to the device, router, adapter or setting it's about, and appears there. No background toasts. |
| P3 | **Shows you what's actually wrong** | "Inability to show me what's actually wrong" | Each offline device shows a one-line reason and one fix button (see §5). |
| P4 | **See the knock-on effect** | "If one device goes out and it causes another to go out, show it" | When a router drops, every device that relied on it is drawn as "cut off by Hall plug", not just "offline". |
| P5 | **The map is always there** | Map page is blank with a "Load map" button | Topology scans run in the background. The map opens instantly with the last scan and its age. |
| P6 | **No ghost devices** | Devices last seen months ago, "Unsupported", red Z icon | Devices not heard from for 30 days move to a "Gone quiet" shelf with Remove / Keep. Unsupported devices say what they are and what's missing. |
| P7 | **Repairs itself** | "Inability to repair itself" | Adapter reconnects on its own, setup that failed retries on its own, devices that stop reporting are re-told on their own (§4). |
| P8 | **Colours you can explain** | Red and blue toasts at random | Only three status colours, each matching a label on screen: green = fine, amber = needs a look, red = not working. Blue = updates only. |

### One view of everything

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P9 | **Your whole network on one screen** | Devices, Map, Dashboard are three separate pages | Home shows map, device list and the selected device's controls together. |
| P10 | **Control devices from the same place you see them** | State and control buried in a device sub-page | Clicking a device on the map or list opens its panel with live state and controls. |
| P11 | **The details that matter, the rest tucked away** | IEEE address as a main column | List shows picture, name, signal, battery, last heard. IEEE, network address, model code sit under "Details". |
| P12 | **Big networks stay readable** | "If there are gazillions of devices this won't work" | Over ~60 devices the map folds battery devices into their router and expands on click. The list works at any size. |
| P13 | **Pictures of every device** | "I do like the little picture" | Keep device pictures (§8). |

### Never stuck

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P14 | **Works even when the adapter doesn't** | UI won't show up when the adapter is unavailable | The UI, settings, logs, last known states and the map all load with the adapter unplugged. A banner says "Zigbee adapter not found" with what to check. |
| P15 | **Starts with nothing** | Won't start without a hand-written config | First run opens a setup wizard. No file needs to exist. |
| P16 | **No YAML. Ever.** | "Get a comma wrong and nothing works" | Everything is set in the UI. A settings file can be exported and imported for scripting. A broken file never stops startup: bad entries are skipped and listed in Settings. |
| P17 | **Finds your adapter for you** | Hand-typing serial ports and adapter types | Wizard lists plugged-in adapters by name, picks the adapter type itself. |

### Made for MQTT

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P18 | **Each device gets its own MQTT topic** | Only possible by putting slashes in its name | Topic is its own field on the device, separate from the display name. |
| P19 | **Choose the message format per device** | Can't shape the JSON or split it into paths | Per device: one JSON message, one topic per value, or both. Optional field renaming. |
| P20 | **MQTT is the first thing in Settings** | MQTT is tab 8 of a sub-sub-menu | MQTT is the first card in Settings. |
| P21 | **Switching is one find-and-replace** *(added)* | — | Topics and message shapes match Zigbee2MQTT's. The base topic is a setting (default `swarm2mqtt`), so it can stay `zigbee2mqtt` and automations don't notice the switch. |

### No jargon

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P22 | **Setup happens by itself** | "Interview" means nothing | No "Interview" button or word. A new device shows "Getting to know Kitchen sensor…" then is ready. Repeats only after a firmware update or if it failed partway. |
| P23 | **No "Reconfigure" button** | "What config? The device has it" | Reporting set-up is redone automatically when a device goes quiet but is still reachable. One "Fix" button covers the rare manual case. |
| P24 | **Adding devices is one obvious button** | "Disable join (All)" with a mystery dropdown | One "Add devices" button. While open, a beacon pulses on the adapter and on every listening router, with a countdown and a helper: "Your network key is being handed out. Don't leave this on." |
| P25 | **The UI teaches Zigbee** | "Show me visually or contextually" | Routers, battery devices and the adapter have different shapes on the map. Lines show who talks through whom. Hover a term once and it explains itself. |
| P26 | **Groups that make sense** | "What is a group? Why might I want one?" | Groups page leads with "Turn several lights on together, instantly, with no popcorn effect." Creating one starts from selecting devices on the map. |
| P27 | **Four menu items, not fourteen** | Eight top items + cog + sub-tabs + sub-sub-tabs | Home, Groups, Activity, Settings: a sidebar on a computer, a bar at the bottom on a phone. No second row of tabs anywhere. |
| P28 | **Advanced stays out of the way** | Blocklist, adapter delay, extended PAN ID next to everyday settings | Niche options live under one collapsed "Advanced" section at the bottom of Settings. |
| P29 | **Looks like it was designed** | "Crappy looking UI" | Built on the same look and behaviour as Sift and Quizaroo (§3.0). Mockups approved by Mat before any UI is built. |

### Everything you had before

| # | Headline | The complaint | Done when |
|---|---|---|---|
| P30 | **Every device Zigbee2MQTT supports** | "Supports every device under the sun" is Z2M's real strength | Uses the same device library (§8), updated with each of its releases. |
| P31 | **Switch from Zigbee2MQTT without re-pairing** *(added)* | — | Import reads Z2M's backup zip (Settings > Tools > Request Zigbee2MQTT backup) and keeps the same network, so every device stays paired. |
| P32 | **You never need to learn Zigbee** | "Zero desire to get my hands dirty" | Mat can install, migrate and run it without reading Zigbee documentation. |

---

## 2. How it's built

```
Browser UI (Svelte)
   │ websocket
Swarm2MQTT service (Node + TypeScript, always running)
   ├─ State store (SQLite): devices, last states, topology history, settings, event log
   ├─ MQTT bridge: per-device topics and formats, bridge online/offline state
   ├─ Health engine: reasons, knock-on effects, automatic repairs
   └─ Radio supervisor ── zigbee-herdsman (talks to the adapter)
                          zigbee-herdsman-converters (device library)
```

- **The service never exits because of the adapter.** The radio supervisor owns herdsman. If the adapter is missing or crashes, the supervisor marks the radio down, retries with backoff, and everything else keeps running. This is the core change from Z2M, which stops when the adapter fails.
- **The store is the source of truth for the UI**, not herdsman's live state. That's what makes P14 possible.
- **Settings live in the store**, edited through the UI. Export/import as JSON (or YAML, same content).
- Runs on Linux as a Node service under systemd, installed with one command. No Docker in v1.
- Updates: an in-app **Update now** button pulls GitHub releases. Two channels like WinSqueeze: every merge to main is a dev build, a chosen dev build is promoted to stable.
- Same front-end stack and DESIGN.md as WinSqueeze.

**Challenge considered and rejected:** just writing a new front end for Zigbee2MQTT. Z2M does allow custom front ends, but the UI would still vanish when the adapter goes (P14), YAML would still exist (P16), per-device formats (P19) need changes inside Z2M. Building on the two libraries Z2M itself uses gets all of that and keeps device support.

---

## 3. Screens

### 3.0 Look and behaviour: the same as Sift and Quizaroo

Swarm2MQTT follows the shared UI rules for every app: https://github.com/hazymat/sift/blob/main/docs/ui-consistency.md#rules-for-every-app. Where those and this list are silent, do what the rest of that doc says. A change here that adds or alters a shared pattern updates that section in the same piece of work.

Applied here:

- **Look:** Quizaroo's Glass theme (and its Light theme): navy gradient, glass cards with soft borders and big rounded corners, pastel tinted pills, light-weight page title with its icon, 👁 View and ⋯ top right, a round + top right (here: Add devices).
- **Frame:** sidebar on a computer (Home, Groups, Activity, Settings at the bottom), each with its own pastel tint when active. On a phone the same four sit in a bar at the bottom, re-ordered by press, hold and drag as in Sift.
- **Undo everything:** every change shows a pill at the bottom with what happened, **Undo**, and a small doughnut that empties as its time runs out. Ctrl+Z / Ctrl+Shift+Z undo and redo after the pill has gone. Activity keeps the whole history, each entry with its own Undo.
- **Changes that reach a device are undone for real:** a rename, group, MQTT topic or device setting is put back on the device.
- **Everything can be undone, removing a device included.** While its pill's doughnut runs, nothing has left yet, so Undo is instant. After that (Ctrl+Z or History), Undo can't bring a device back on its own, so it says so and helps: "Kitchen sensor has left the network. To bring it back, put it in pairing mode: hold its button for 5 seconds." Adding devices opens by itself with the beacon and a countdown, the device's own pairing tip is shown, and when that same device rejoins its name, room, groups, MQTT settings and map position come back automatically. If it doesn't appear before the countdown ends: "Didn't hear from it. Try again" with one button.
- **Choosing several:** press and hold a device (in the list or on the map) to choose it: an accent ring around it, and the selection bar rises at the bottom. While any are chosen, a tap adds or removes one; Shift+click a run. Ctrl/⌘+click with a mouse.
- **Selection bar** (Sift's): ✕ Esc first, the count, then actions with their keys: Add to group, Fix, Remove D. Toasts stack above it, never under.
- **Dragging:** hold a device row: it wiggles, lifts with a shadow and a slight tilt, the others slide aside, and a dashed slot shows where it lands. The list keeps Your order. On the map, dragging a device moves it and the map remembers where.
- **Keys:** shown on buttons (hidden on touch screens). ↑ ↓ move through the list, Enter opens, Esc closes, / searches, J opens Add devices.
- **Phone:** Home has Map | Devices as underlined tabs. Tapping a device opens its page; swipe sideways to go back.
- **Hints:** first-run callouts with their own ✕ (Sift's `hintHtml`), never paragraphs of help text.

### 3.1 Setup wizard (first run, or Settings > Start again)
1. **Your adapter.** Lists plugged-in adapters by name ("Sonoff ZBDongle-E"). One click. "Mine isn't listed" shows unplug/replug hint.
2. **Coming from Zigbee2MQTT?** Yes: drop its backup zip, we import network, devices, names and groups (P31). No: create a new network (keys generated, never shown).
3. **MQTT.** Server address, user, password, with a live "Connected" tick. "Skip, I don't use MQTT" allowed.
4. **Done.** Lands on Home with "Add devices" glowing if the network is empty.

### 3.2 Home
- **Left: map.** Adapter in the centre, routers as squares, battery devices as circles, lines for "talks through". Line thickness = signal. Problems use the status colours. Drag to rearrange, positions remembered. No rooms or floor plans: the map is the radio map.
- **Rewind:** ◀ ▶ under the map hop to the previous or next mesh change, with its time. **Compare** overlays that moment on now: routes that went are dashed, new ones solid with a halo. Route discovery listens to normal traffic and rejoins, plus a full scan every 6 hours and on demand.
- **Route switches live:** the line slides to the new router and a faint dashed ghost of the old route fades over a day. Clicking the ghost says what changed and when.
- **Right: list.** Picture, name, signal bars, battery, last heard. Sorted problems-first. Search box. Clicking a row highlights it on the map and vice versa.
- **Bottom/side: device panel** for the selected device (3.3).
- **Header:** network status pill ("All good" / "2 need a look"), Add devices button.

### 3.3 Device panel
- Picture, name (click to rename). A new device keeps its model name until renamed.
- **Controls** generated from the device library: switches, sliders, colour, readings.
- **Health line:** "Fine", or the reason and one Fix button (§5).
- **How it connects:** "Talks through Hall plug → adapter". Plain words, mirrors the map.
- **Route strip:** 30 days as a bar, one segment per router it used, gaps where offline; every colour named on tap. Tap a point to rewind the map there.
- **Signal graph:** each link's quality over 30 days.
- **Check-ins:** what was learnt, e.g. "Usually reports every 12 min (learnt over 9 days). Counted offline after 40 min of silence." Small chart of recent gaps. "Learning…" with the fallback times until enough check-ins. Override allowed, undoable.
- **Settings:** the common few first, the rest under More.
- **MQTT** card: topic, format (§6).
- **Details** (collapsed): IEEE, network address, model code, firmware, raw last message, Remove.
- Firmware update offer appears here when available (replaces Z2M's OTA page).

### 3.4 Add devices
- Button turns into a ring counting down 4 minutes, with a Stop button.
- **Beacon:** while open, the adapter and every listening router pulse with expanding rings on the map, and the header pill pulses too, so it's visible from any page. Click a router to stop it listening (replaces the "(All)" dropdown).
- **Helper** under the countdown, always shown while open: "While this is on, any device nearby can join and is handed your network key, including a neighbour's. Turn it off once your device is in."
- Panel text: "Put your device in pairing mode now. Usually: hold the button 5 seconds." Pulls the device-specific tip when known.
- Each new device appears live: "Found a device… Getting to know it… Ready. Name it?"

### 3.5 Groups
Empty state explains with one image and one sentence (P26). Create = select devices on the map, "Make a group". Group gets its own controls and MQTT topic.

### 3.6 Activity
Plain-English timeline ("Kitchen sensor went quiet. Hall plug was switched off at 14:02."), kept 30 days like all history. Filter by device. Linked to the map both ways: tapping an entry rewinds the map to that moment, hopping the map scrolls the log to match. "Technical log" toggle shows the raw log for forum posts, with Copy.

### 3.7 Settings (one page of cards, top to bottom)
1. MQTT
2. Zigbee adapter (status, change adapter, backup network)
3. Updates (app and device library)
4. Export / import settings
5. Anonymous stats (off): opt in to send device models and adapter type only, with a preview of exactly what's sent
6. Advanced (collapsed): channel, blocklist/passlist, Touchlink, adapter delay, extended PAN ID, Green Power, network key backup.

---

## 4. Automatic repairs (what replaces the buttons)

| Situation | What Swarm2MQTT does by itself | What the user sees |
|---|---|---|
| Adapter unplugged or crashed | Retry every 5 s, then 30 s | Banner, last states greyed with "as of 14:02" |
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
| Adapter disconnected | "Zigbee adapter not found. Check it's plugged in." | Banner |
| MQTT connect failed | "Can't reach your MQTT server at 10.x.x.x. Wrong password?" | Settings > MQTT, header pill |
| Unsupported device | "We know this is a Tuya device but not which one, so it has no controls yet." → Copy details to request support | Device panel |

The translation table is a file in the repo. Any error without an entry shows "Something went wrong talking to <device>" plus details, and is logged so we can add an entry.

---

## 6. MQTT per device

- **Base topic:** set in Settings > MQTT, default `swarm2mqtt`. Every topic, including `bridge/…`, sits under it. Setting it to `zigbee2mqtt` lets existing flows keep working unchanged.
- **Device topic:** `<base>/<name>` (P21), editable per device.
- **Bridge state:** `<base>/bridge/state` is retained `online`/`offline`, with `offline` set as the MQTT last will.
- **Heartbeat:** `<base>/bridge/tele` every 60 s by default (Settings > MQTT, can be changed or turned off): uptime, adapter up/down, devices online/total. Anything watching Swarm2MQTT just checks these keep arriving.
- **Format**, per device, three choices:
  - One message: `…/kitchen_sensor` → `{"occupancy":true,"battery":80}`
  - One topic per value: `…/kitchen_sensor/occupancy` → `true`
  - Both
- **Rename fields** (optional): table of library name → your name, e.g. `occupancy` → `motion`.
- **Commands in:** same shape accepted on `…/set` (JSON) or `…/<field>/set` (single value).
- Preview box shows exactly what the next message will look like.

---

## 7. Answers the UI must give without words (from the rant)

- **Coordinator** = the adapter. Drawn at the centre of the map, labelled "Adapter".
- **Why join turns itself off:** when a device joins, it's handed the network's key, and most devices accept it using a default code everyone knows. While open, a neighbour's bulb in pairing mode can join your network, and someone nearby with a radio could catch the key. Shown as the pulsing beacon and helper in §3.4.
- **Routers vs battery devices:** shape on the map; hover says "Plugged-in devices pass messages on. Battery devices sleep and rely on one."
- **Groups:** one command to many devices at once, so lights change together instead of one by one.

---

## 8. Reused, and credit

- **zigbee-herdsman** and **zigbee-herdsman-converters** (both MIT, maintained by Koen Kanters and the Zigbee2MQTT community). Used as npm dependencies, unmodified. Credited in About and README. Device-support fixes go upstream to converters, not into a private fork.
- **Device pictures** are loaded from zigbee2mqtt.io the first time a device appears, then cached locally so they still show offline. Not bundled, so the app stays small and new devices get pictures without a release. A generic shape (plug, bulb, sensor, switch) shows until the picture arrives or if it can't be fetched.
- **Swarm2MQTT is GPL-3.0**, the same licence as Zigbee2MQTT. Reusing Z2M code is allowed with credit, but the plan is still to build on the two libraries, not to fork Z2M. Its data-folder format is read for import.
- Name must not include "zigbee2mqtt".

---

## 9. Not in v1

Home Assistant discovery (Node-RED and plain MQTT only), a login for the web page (meant for a trusted home network), extensions/plugins, Touchlink beyond Advanced, multiple adapters, translations (English first, then the usual 16), Docker/HA add-on packaging.

---

## 10. Switching over

No test network: we cut over on Mat's existing adapter.
1. Request a backup zip from Z2M's web page, then stop Z2M. Swarm2MQTT imports the zip (network key, devices, names).
2. Stop Z2M. Start Swarm2MQTT on the same adapter. Devices stay paired.
3. Either set the base topic to `zigbee2mqtt` so nothing else changes, or keep `swarm2mqtt` and repoint flows later. The switching-over page lists every topic that differs.
4. If anything is wrong: stop Swarm2MQTT, start Z2M. Its folder is never written to, so going back always works.

---

## 11. Name: Swarm2MQTT

Chosen by Mat, 27 Nov 2026. Tagline: **"Zigbee2MQTT, but sensible."** Keeps the familiar "2MQTT" pattern; a swarm is both bees and a houseful of devices.

Checked: no GitHub repos, npm free, swarm2mqtt.com/.io/.dev unregistered. Always show the name with the tagline. Never call it a fork or a new version of Zigbee2MQTT.

Rejected: Plainbee, Zigview, Zigherd, ZigMQTT (and any Zig- name), BeeMQTT, Zigbee3MQTT, Zigbee-Loves-MQTT, ZigbeeMQTT.

---

## 12. Product decisions (v1)

- **Adapters:** Ember and Z-Stack. Any other adapter gets "This adapter isn't supported yet" with its name, never a crash. No model-specific workarounds in the app.
- **New devices wait for you.** A joined device goes to **Waiting for you** and sends no MQTT until accepted. Accept or reject, both undoable (a reject is undone by the guided rejoin).
- **Unknown devices** get best-guess controls built from what the device reports, marked "guessed". You can remove, change or re-add them, and add others from the device's list of everything it reports. Undoable.
- **Firmware updates:** one tap per device. Blue "Update available", progress and time left. Never automatic.
- **Direct control:** drag a switch onto a light or group to bind them. Shown as a line on the map, keeps working with the server or MQTT down. Undoable.
- **History:** 30 days per value, kept by the server as updates arrive. Graphs in the device panel, battery trend with "about N weeks left".
- **Backups:** daily and before every change, newest 14 kept. Settings > Backup lists them; restore is one tap.
- **Phones:** installable web app (add to home screen), same page.
- **Import without re-pairing:** Zigbee2MQTT only.
- **Base topic:** a setting, default `swarm2mqtt` (§6).
- **Monitoring:** retained bridge state with last will, and a heartbeat on `<base>/bridge/tele` (§6). Nothing else is needed to watch it.
- **Scenes:** set devices how you like, Save as scene; recall from the page, a switch or MQTT. Undoable.
- **Groups** stay (one command reaches many devices at once). No rooms, no floor plans.
- **Notifications:** none of its own. Problems show on the page and go out on `<base>/bridge/event`; your own tools notify you.
- **Offline** is learnt per device and shown (§3.3).
- **Battery warning:** predicted from the 30-day trend; warns a set time ahead, default 3 weeks (Settings). Devices without a usable trend use a % threshold, also a setting.
- **Radio channel (new networks only):** scans at first setup and picks the quietest of 15, 20 or 25, which sit between the usual WiFi channels. Imported networks keep theirs. Changeable in Advanced, warning that some devices may need to rejoin. (Z2M simply uses 11 with no scan.)
- **Stats:** opt-in only (§3.7).
- **Install:** Linux, Node service, one command; in-app Update now; dev and stable channels (§2).
- **Not in v1:** Home Assistant discovery, a login for the web page (§9).

## 13. Build status (0.1, 27 Nov 2026)

Built: everything in §12, the setup wizard, Home (map with rewind, compare and ghost routes; list; device panel with route strip, signal, check-ins, battery, MQTT, direct control, firmware), Groups with scenes, Activity linked to the map, Settings, simulator, install and update script, dev and stable releases.

Not yet:
- Tried on a real adapter. The herdsman side compiles and handles a missing adapter, but nothing has paired through it yet.
- Channel scan: herdsman has no energy scan for every adapter, so a new network uses channel 20 unless a scan result exists.
- Your changes: undo and redo go back in order; undoing one older entry on its own comes later.
- Dragging rows into your own order (the map nodes and the phone bar already drag).

## 14. Open questions

None right now.
