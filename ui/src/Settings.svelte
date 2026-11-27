<script>
  import {live, act, call, toast} from "./api.svelte.js";
  import {view, save, go} from "./ui.svelte.js";
  import {dayClock, adapterState} from "./util.js";
  import {readBackupFiles} from "./z2mzip.js";
  import AddressField from "./AddressField.svelte";
  const MQTT_KINDS = [{label: "mqtt://", scheme: "mqtt", port: 1883}, {label: "mqtts://", scheme: "mqtts", port: 8883}];
  const ADAPTER_KINDS = [{label: "Network", scheme: "tcp", port: 6638}, {label: "USB", path: true, placeholder: "/dev/ttyUSB0"}];
  let snap = $derived(live.snap), adapter = $derived(adapterState(snap.radio));
  let mqtt = $state(Object.assign({}, live.snap.mqtt.settings));
  let prefs = $state(Object.assign({}, live.snap.prefs));
  let advanced = $state(false), stickPath = $state(live.snap.stick?.path ?? ""), stickType = $state(live.snap.stick?.adapter ?? "ember"), channel = $state(""), z2mFiles = $state(null), z2mPreview = $state(null);
  async function saveMqtt() {await act("mqtt", {url: mqtt.url, username: mqtt.username, password: mqtt.password, baseTopic: mqtt.baseTopic, heartbeatSeconds: Number(mqtt.heartbeatSeconds) || 0})}
  const savePrefs = () => act("prefs", {batteryLeadDays: Number(prefs.batteryLeadDays), batteryPercent: Number(prefs.batteryPercent), stats: prefs.stats, updateChannel: prefs.updateChannel});
  let statsPreview = $derived({version: snap.version, adapter: snap.radio.stick, models: Array.from(new Set(snap.devices.map(device => device.model).filter(Boolean))).sort()});
  function exportSettings() {const data = {exported: new Date().toISOString(), version: snap.version, mqtt: Object.assign({}, snap.mqtt.settings, {password: undefined}), prefs: snap.prefs, devices: snap.devices.map(device => ({ieee: device.ieee, name: device.name, topic: device.topic, format: device.format, renames: device.renames})), groups: snap.groups, scenes: snap.scenes}; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"})); link.download = "swarm2mqtt-settings.json"; link.click()}
</script>
<div class="settings">
  <section class="card">
    <h2>MQTT {#if snap.mqtt.connected}<span class="ok">✓ Connected</span>{:else if snap.mqtt.error}<span class="bad">{snap.mqtt.error}</span>{:else if snap.mqtt.settings.url}<span class="muted">Connecting…</span>{/if}</h2>
    <div class="kv" id="mqtt-server"><span class="k">Server</span><div class="field"><AddressField bind:value={mqtt.url} kinds={MQTT_KINDS}/><div class="fieldhint">The port is usually 1883 (8883 for mqtts).</div></div></div>
    <div class="kv"><span class="k">User</span><input class="text" bind:value={mqtt.username} autocomplete="off"></div>
    <div class="kv"><span class="k">Password</span><input class="text" type="password" bind:value={mqtt.password} autocomplete="new-password"></div>
    <div class="kv"><span class="k">Base topic</span><input class="text" bind:value={mqtt.baseTopic}></div>
    <div class="kv"><span class="k">Heartbeat every</span><span class="unit"><input class="text num" type="number" min="0" bind:value={mqtt.heartbeatSeconds}> s</span></div>
    <p class="note">Sends <code>{mqtt.baseTopic}/bridge/tele</code> with uptime, adapter and device counts, so anything watching knows Swarm2MQTT is alive. <code>{mqtt.baseTopic}/bridge/state</code> says online or offline. 0 turns the heartbeat off.</p>
    <button class="pill primary" onclick={saveMqtt}>Save</button>
  </section>

  <section class="card">
    <h2>Zigbee adapter <span class="state" class:pulse={adapter.kind === "connecting"} style="color:{adapter.colour}">{adapter.kind === "up" ? "✓ " : ""}{adapter.text}</span>{#if adapter.kind !== "up" && !snap.sim}<button class="link" onclick={() => go("home")}>What's wrong?</button>{/if}</h2>
    {#if snap.radio.channel}<div class="kv"><span class="k">Channel</span><span>{snap.radio.channel}</span></div>{/if}
    <div class="subhead"><b>Backups</b><button class="pill ghost" onclick={() => act("backupNow").then(() => toast("Backed up", null))}>Back up now</button></div>
    <p class="fieldhint">Made daily and before every big change. The newest 14 are kept.</p>
    <div class="backups">
      {#each snap.backups as backup (backup.name)}<div class="kv"><span>{dayClock(backup.ts)} <span class="faint">{backup.reason.replace(/-/g, " ")}</span></span><button class="link" onclick={() => toast(`Restoring the backup from ${dayClock(backup.ts)}`, null, "info", () => act("restore", {name: backup.name}).catch(() => {}))}>Restore</button></div>{:else}<span class="faint">None yet</span>{/each}
    </div>
  </section>

  <section class="card">
    <h2>Warnings</h2>
    <div class="kv"><span class="k">Warn about a battery</span><span class="unit"><input class="text num" type="number" min="1" bind:value={prefs.batteryLeadDays} onchange={savePrefs}> days before it runs out</span></div>
    <div class="kv"><span class="k">If it can't be predicted, warn at</span><span class="unit"><input class="text num" type="number" min="1" max="100" bind:value={prefs.batteryPercent} onchange={savePrefs}> %</span></div>
  </section>

  <section class="card" id="updates-card">
    <h2>Updates</h2>
    <div class="kv"><span class="k">Swarm2MQTT</span><span>{snap.version}{snap.prefs?.updateChannel === "dev" ? " · Dev" : ""} <button class="link" onclick={() => {view.whatsNewAll = true; view.whatsNew = true}}>What's new</button></span></div>
    <div class="kv"><span class="k">Channel</span><span class="seg"><button class:on={prefs.updateChannel !== "dev"} onclick={() => {prefs.updateChannel = "stable"; act("prefs", {updateChannel: "stable"})}}>Stable</button><button class:on={prefs.updateChannel === "dev"} onclick={() => {prefs.updateChannel = "dev"; act("prefs", {updateChannel: "dev"})}}>Dev</button></span></div>
    {#if snap.update?.available}
      <div class="kv"><span><span class="dot" style="background:var(--blue)"></span> {snap.update.latest} is out</span><button class="pill primary" disabled={snap.update.running} onclick={() => act("updateNow").catch(() => {})}>{snap.update.running ? "Updating…" : `Update to ${snap.update.latest}`}</button></div>
    {:else}<div class="kv"><span class="muted">{snap.update?.checkedAt ? "Up to date" : ""}</span><button class="pill ghost" onclick={() => act("updateCheck").catch(() => {})}>Check for updates</button></div>{/if}
  </section>

  <section class="card">
    <h2>Look</h2>
    <div class="kv"><span class="k">Theme</span><span class="seg"><button class:on={view.theme !== "light"} onclick={() => {view.theme = "glass"; save("s2m-theme", "glass")}}>Glass</button><button class:on={view.theme === "light"} onclick={() => {view.theme = "light"; save("s2m-theme", "light")}}>Light</button></span></div>
    <div class="kv"><span class="k">Hints</span><span><button class="link" onclick={() => {view.hintsSeen = []; save("s2m-hints", [])}}>Show all again</button></span></div>
  </section>

  <section class="card">
    <h2>Export</h2>
    <button class="pill ghost" onclick={exportSettings}>Download settings (JSON)</button>
  </section>

  <section class="card">
    <h2>Help improve Swarm2MQTT <button class="switch" class:on={prefs.stats} onclick={() => {prefs.stats = !prefs.stats; savePrefs()}} aria-label="Send anonymous stats"></button></h2>
    <p class="note">Off unless you turn it on. When on, only this would be sent: which device models and adapter you use, never names, addresses or readings.</p>
    <div class="code"><code>{JSON.stringify(statsPreview)}</code></div>
  </section>

  <section class="card">
    <button class="h2btn" onclick={() => advanced = !advanced}><h2>Advanced {advanced ? "▾" : "▸"}</h2></button>
    {#if advanced}
      <div class="kv"><span class="k">Adapter address</span><div class="field"><AddressField bind:value={stickPath} kinds={ADAPTER_KINDS}/><div class="fieldhint">On your network: its IP address, port 6638. Plugged in here: /dev/ttyUSB0</div></div><span class="seg"><button class:on={stickType === "ember"} onclick={() => stickType = "ember"}>Ember</button><button class:on={stickType === "zstack"} onclick={() => stickType = "zstack"}>Z-Stack</button></span><button class="pill ghost" disabled={!stickPath} onclick={() => act("stickPath", {path: stickPath, adapter: stickType})}>Use</button></div>
      <div class="kv"><span class="k">Channel</span><span class="unit"><input class="text num" type="number" min="11" max="26" placeholder={String(snap.radio.channel ?? "")} bind:value={channel}><span class="fieldhint">11 to 26{snap.radio.channel ? `, now ${snap.radio.channel}` : ""}</span><button class="pill ghost" disabled={!Number(channel)} onclick={() => toast(`Changing to channel ${channel}. Some devices may need to rejoin.`, null, "info", () => act("channel", {channel: Number(channel)}).catch(() => {}))}>Change</button></span></div>
      <div class="kv"><span class="k">Import from Zigbee2MQTT</span><label class="pill ghost">Pick its files<input type="file" multiple accept=".zip,.yaml,.db,.json" hidden onchange={event => readBackupFiles(event.currentTarget.files).then(files => {z2mFiles = files; return call("z2mPreview", {files})}).then(result => z2mPreview = result).catch(error => toast(error.message, null, "bad"))}></label><span class="muted">configuration.yaml, database.db and coordinator_backup.json from its data folder, or a zip of it</span></div>
      {#if z2mPreview}<div class="callout info"><span class="t">Found {z2mPreview.summary}. Stop Zigbee2MQTT first: only one can use the adapter.</span><button class="pill" onclick={() => act("z2mImport", {files: z2mFiles, keepBaseTopic: true}).then(() => z2mPreview = null)}>Import</button></div>{/if}
    {/if}
  </section>
</div>
<style>
  .settings{padding:18px 24px 90px;display:flex;flex-direction:column;gap:14px;max-width:760px}
  section{padding:16px;display:flex;flex-direction:column;gap:6px}
  h2{font-size:17px;font-weight:500;display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:4px}
  h2 span{font-size:14px;font-weight:400}
  .ok{color:var(--green)}.bad{color:var(--red)}
  .kv .text{max-width:340px}
  .field{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
  .unit{display:flex;align-items:center;gap:6px}
  .num{width:80px}
  .note{font-size:13.5px;color:var(--muted)}
  .pill{align-self:flex-start}
  .link{color:var(--accent);font-size:14px}
  .subhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px}
  .state{font-size:14px;font-weight:400}.pulse{animation:pulse 1.4s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}
  .backups{display:flex;flex-direction:column;max-height:220px;overflow-y:auto}
  .h2btn{text-align:left;width:100%}
  @media (max-width:700px){.settings{padding:12px}.kv{flex-wrap:wrap}.kv .field{flex:1 1 100%;min-width:0}.kv .text{max-width:none}}
</style>
