<script>
  import {live, act, call, toast} from "./api.svelte.js";
  import {view, save, go} from "./ui.svelte.js";
  import {dayClock, adapterState} from "./util.js";
  import {readBackupFiles} from "./z2mzip.js";
  import AddressField from "./AddressField.svelte";
  import Panel from "./Panel.svelte";
  const MQTT_KINDS = [{label: "mqtt://", scheme: "mqtt", port: 1883}, {label: "mqtts://", scheme: "mqtts", port: 8883}];
  const ADAPTER_KINDS = [{label: "Network", scheme: "tcp", port: 6638}, {label: "USB", path: true, placeholder: "/dev/ttyUSB0"}];
  let snap = $derived(live.snap), adapter = $derived(adapterState(snap.radio));
  let mqtt = $state(Object.assign({}, live.snap.mqtt.settings));
  let prefs = $state(Object.assign({}, live.snap.prefs));
  let stickPath = $state(live.snap.stick?.path ?? ""), stickType = $state(live.snap.stick?.adapter ?? "ember"), channel = $state(""), z2mFiles = $state(null), z2mPreview = $state(null);
  async function saveMqtt() {try {await act("mqtt", {url: mqtt.url, username: mqtt.username, password: mqtt.password, baseTopic: mqtt.baseTopic, heartbeatSeconds: Number(mqtt.heartbeatSeconds) || 0}); toast("Saved. Connecting to the MQTT server…", null)} catch {}}
  const savePrefs = () => act("prefs", {batteryLeadDays: Number(prefs.batteryLeadDays), batteryPercent: Number(prefs.batteryPercent), stats: prefs.stats, updateChannel: prefs.updateChannel}).then(() => toast("Saved", null)).catch(() => {});
  let statsPreview = $derived({version: snap.version, adapter: snap.radio.stick, models: Array.from(new Set(snap.devices.map(device => device.model).filter(Boolean))).sort()});
  function exportSettings() {const data = {exported: new Date().toISOString(), version: snap.version, mqtt: Object.assign({}, snap.mqtt.settings, {password: undefined}), prefs: snap.prefs, devices: snap.devices.map(device => ({ieee: device.ieee, name: device.name, description: device.note, topic: device.topic, format: device.format, renames: device.renames})), groups: snap.groups, scenes: snap.scenes}; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"})); link.download = "swarm2mqtt-settings.json"; link.click()}
</script>
<div class="settings">
  <Panel key="mqtt" title="MQTT" status={snap.mqtt.connected ? `✓ Connected to ${(snap.mqtt.settings.url ?? "").replace(/^\w+:\/\//, "")}` : snap.mqtt.error ?? (snap.mqtt.settings.url ? "Connecting…" : "Not set up")} tone={snap.mqtt.connected ? "ok" : snap.mqtt.error ? "bad" : ""}>
    <div class="kv" id="mqtt-server"><span class="k">Server</span><div class="field"><AddressField bind:value={mqtt.url} kinds={MQTT_KINDS}/><div class="fieldhint">The port is usually 1883 (8883 for mqtts).</div></div></div>
    <div class="kv"><span class="k">User</span><input class="text" bind:value={mqtt.username} autocomplete="off"></div>
    <div class="kv"><span class="k">Password</span><input class="text" type="password" bind:value={mqtt.password} autocomplete="new-password"></div>
    <div class="kv"><span class="k">Base topic</span><div class="field"><input class="text" bind:value={mqtt.baseTopic}><div class="fieldhint">Anything listening (Node-RED, Home Assistant) must use the same topic. Coming from Zigbee2MQTT, it starts as Zigbee2MQTT's.</div></div></div>
    <div class="kv"><span class="k">Heartbeat every</span><span class="unit"><input class="text num" type="number" min="0" bind:value={mqtt.heartbeatSeconds}> s</span></div>
    <p class="note">Sends <code>{mqtt.baseTopic}/bridge/tele</code> with uptime, adapter and device counts, so anything watching knows Swarm2MQTT is alive. <code>{mqtt.baseTopic}/bridge/state</code> says online or offline. 0 turns the heartbeat off.</p>
    <button class="pill primary" onclick={saveMqtt}>Save</button>
  </Panel>

  <Panel key="adapter" title="Zigbee adapter" status={(adapter.kind === "up" ? "✓ " : "") + adapter.text + (snap.radio.channel ? ` · channel ${snap.radio.channel}` : "")} tone={adapter.kind === "up" ? "ok" : adapter.kind === "connecting" ? "blue" : "bad"}>
    {#if adapter.kind !== "up" && !snap.sim}<button class="link" onclick={() => go("home")}>What's wrong?</button>{/if}
    <div class="subhead"><b>Backups</b><button class="pill ghost" onclick={() => act("backupNow").then(() => toast("Backed up", null))}>Back up now</button></div>
    <p class="fieldhint">Made daily and before every big change. The newest 14 are kept.</p>
    <div class="backups">
      {#each snap.backups as backup (backup.name)}<div class="kv"><span>{dayClock(backup.ts)} <span class="faint">{backup.reason.replace(/-/g, " ")}</span></span><button class="link" onclick={() => toast(`Restoring the backup from ${dayClock(backup.ts)}`, null, "info", () => act("restore", {name: backup.name}).then(() => toast("Restored. The adapter restarts with it.", null)).catch(() => {}))}>Restore</button></div>{:else}<span class="faint">None yet</span>{/each}
    </div>
  </Panel>

  <Panel key="warnings" title="Battery warnings" status={`${prefs.batteryLeadDays} days before empty, or at ${prefs.batteryPercent}%`}>
    <div class="kv"><span class="k">Warn about a battery</span><span class="unit"><input class="text num" type="number" min="1" bind:value={prefs.batteryLeadDays} onchange={savePrefs}> days before it runs out</span></div>
    <div class="kv"><span class="k">If it can't be predicted, warn at</span><span class="unit"><input class="text num" type="number" min="1" max="100" bind:value={prefs.batteryPercent} onchange={savePrefs}> %</span></div>
  </Panel>

  <Panel key="updates" id="updates-card" title="Updates" status={snap.update?.available ? `${snap.update.latest} is out` : `Version ${snap.version}${snap.prefs?.updateChannel === "dev" ? " · Dev" : ""}`} tone={snap.update?.available ? "blue" : ""}>
    <div class="kv"><span class="k">Swarm2MQTT</span><span>{snap.version}{snap.prefs?.updateChannel === "dev" ? " · Dev" : ""} <button class="link" onclick={() => {view.whatsNewAll = true; view.whatsNew = true}}>What's new</button></span></div>
    <div class="kv"><span class="k">Channel</span><span class="seg"><button class:on={prefs.updateChannel !== "dev"} onclick={() => {prefs.updateChannel = "stable"; act("prefs", {updateChannel: "stable"}).catch(() => {})}}>Stable</button><button class:on={prefs.updateChannel === "dev"} onclick={() => {prefs.updateChannel = "dev"; act("prefs", {updateChannel: "dev"}).catch(() => {})}}>Dev</button></span></div>
    {#if snap.update?.available}
      <div class="kv"><span><span class="dot" style="background:var(--blue)"></span> {snap.update.latest} is out</span><button class="pill primary" disabled={snap.update.running} onclick={() => act("updateNow").catch(() => {})}>{snap.update.running ? "Updating…" : `Update to ${snap.update.latest}`}</button></div>
    {:else}<div class="kv"><span class="muted">{snap.update?.checkedAt ? "Up to date" : ""}</span><button class="pill ghost" onclick={() => act("updateCheck").then(latest => toast(latest ? `${latest} is out` : `Up to date: ${snap.version} is the newest`, null)).catch(() => {})}>Check for updates</button></div>{/if}
  </Panel>

  <Panel key="look" title="Look" status={view.theme === "light" ? "Light" : "Glass"}>
    <div class="kv"><span class="k">Theme</span><span class="seg"><button class:on={view.theme !== "light"} onclick={() => {view.theme = "glass"; save("s2m-theme", "glass")}}>Glass</button><button class:on={view.theme === "light"} onclick={() => {view.theme = "light"; save("s2m-theme", "light")}}>Light</button></span></div>
    <div class="kv"><span class="k">Hints</span><span><button class="link" onclick={() => {view.hintsSeen = []; save("s2m-hints", [])}}>Show all again</button></span></div>
  </Panel>

  <Panel key="undo" title="Undo history" status={snap.undo.length ? `${snap.undo.filter(entry => !entry.undone).length} changes · Ctrl+Z undo, Ctrl+Y redo` : "No changes yet"}>
    {#each snap.undo.slice(0, 3) as entry (entry.id)}<div class="kv"><span class:faint={entry.undone}>{entry.label}</span><span class="faint">{dayClock(entry.ts)}</span></div>{/each}
    <button class="pill ghost" onclick={() => go("history")}>Open undo history</button>
  </Panel>

  <Panel key="export" title="Export" status="Settings as a JSON file">
    <button class="pill ghost" onclick={exportSettings}>Download settings (JSON)</button>
  </Panel>

  <Panel key="stats" title="Help improve Swarm2MQTT" status={prefs.stats ? "On" : "Off"}>
    <div class="kv"><span class="k">Send anonymous stats</span><button class="switch" class:on={prefs.stats} onclick={() => {prefs.stats = !prefs.stats; savePrefs()}} aria-label="Send anonymous stats"></button></div>
    <p class="note">Off unless you turn it on. When on, only this would be sent: which device models and adapter you use, never names, addresses or readings.</p>
    <div class="code"><code>{JSON.stringify(statsPreview)}</code></div>
  </Panel>

  <Panel key="advanced" title="Advanced" status="Adapter address, channel, import from Zigbee2MQTT">
    <div class="kv"><span class="k">Adapter address</span><div class="field"><AddressField bind:value={stickPath} kinds={ADAPTER_KINDS}/><div class="fieldhint">On your network: its IP address, port 6638. Plugged in here: /dev/ttyUSB0</div></div><span class="seg"><button class:on={stickType === "ember"} onclick={() => stickType = "ember"}>Ember</button><button class:on={stickType === "zstack"} onclick={() => stickType = "zstack"}>Z-Stack</button></span><button class="pill ghost" disabled={!stickPath} onclick={() => act("stickPath", {path: stickPath, adapter: stickType}).then(() => toast("Saved. Connecting to the adapter…", null)).catch(() => {})}>Use</button></div>
    <div class="kv"><span class="k">Channel</span><span class="unit"><input class="text num" type="number" min="11" max="26" placeholder={String(snap.radio.channel ?? "")} bind:value={channel}><span class="fieldhint">11 to 26{snap.radio.channel ? `, now ${snap.radio.channel}` : ""}</span><button class="pill ghost" disabled={!Number(channel)} onclick={() => toast(`Changing to channel ${channel}. Some devices may need to rejoin.`, null, "info", () => act("channel", {channel: Number(channel)}).then(() => toast(`Moving to channel ${channel}. The adapter restarts on it.`, null)).catch(() => {}))}>Change</button></span></div>
    <div class="kv"><span class="k">Import from Zigbee2MQTT</span><label class="pill ghost">Pick its files<input type="file" multiple accept=".zip,.yaml,.db,.json" hidden onchange={event => readBackupFiles(event.currentTarget.files).then(files => {z2mFiles = files; return call("z2mPreview", {files})}).then(result => z2mPreview = result).catch(error => toast(error.message, null, "bad"))}></label><span class="muted">configuration.yaml, database.db and coordinator_backup.json from its data folder, or a zip of it</span></div>
    {#if z2mPreview}<div class="callout info"><span class="t">Found {z2mPreview.summary}. Stop Zigbee2MQTT first: only one can use the adapter.</span><button class="pill" onclick={() => act("z2mImport", {files: z2mFiles, keepBaseTopic: true}).then(() => {z2mPreview = null; toast("Imported from Zigbee2MQTT", null)}).catch(() => {})}>Import</button></div>{/if}
  </Panel>
</div>
<style>
  .settings{padding:18px 24px 90px;display:flex;flex-direction:column;gap:12px;max-width:760px}
  .kv .text{max-width:340px}
  .field{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
  .unit{display:flex;align-items:center;gap:6px}
  .num{width:80px}
  .note{font-size:13.5px;color:var(--muted)}
  .pill{align-self:flex-start}
  .link{color:var(--accent);font-size:14px}
  .subhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px}
  .backups{display:flex;flex-direction:column;max-height:220px;overflow-y:auto}
  @media (max-width:700px){.settings{padding:12px}.kv{flex-wrap:wrap}.kv .field{flex:1 1 100%;min-width:0}.kv .text{max-width:none}}
</style>
