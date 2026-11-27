<script>
  // Setup: MQTT first (it's also how we ask Zigbee2MQTT for its network), then Zigbee2MQTT, then the adapter
  import {live, act, call, toast} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  import {readBackupFiles} from "./z2mzip.js";
  import AddressField from "./AddressField.svelte";
  const MQTT_KINDS = [{label: "mqtt://", scheme: "mqtt", port: 1883}, {label: "mqtts://", scheme: "mqtts", port: 8883}];
  const ADAPTER_KINDS = [{label: "Network", scheme: "tcp", port: 6638}, {label: "USB", path: true, placeholder: "/dev/ttyUSB0"}];
  view.wizard = true;
  let snap = $derived(live.snap);
  let step = $state(1), busy = $state(false);
  // 1 MQTT
  let mqtt = $state({url: "", username: "", password: ""}), probe = $state(null), probeError = $state("");
  async function connectMqtt() {
    busy = true; probe = null; probeError = "";
    try {probe = await call("mqttProbe", {url: mqtt.url, username: mqtt.username, password: mqtt.password}); await act("mqtt", {url: mqtt.url, username: mqtt.username, password: mqtt.password}); const pick = probe.z2m.find(item => item.running) ?? probe.z2m.find(item => !item.leftBehind); if (pick) {baseTopic = pick.baseTopic; from = "z2m"}}
    catch (error) {probeError = error.message}
    busy = false;
  }
  // old messages can't come back once removed, so it waits for the pill's doughnut (Undo stops it)
  function clearOld(topic) {toast(`Removing what the old Zigbee2MQTT left on ${topic}`, null, "info", async () => {try {const count = await call("mqttClearLeftBehind", {baseTopic: topic}); toast(`Removed ${count} old messages`, null); probe = await call("mqttProbe", {})} catch (error) {toast(error.message, null, "bad")}})}
  // 2 Zigbee2MQTT
  let from = $state(null), baseTopic = $state("zigbee2mqtt"), network = $state(null), chosen = $state([]), byFiles = $state(false), dragging = $state(false), files = null;
  let found = $derived(probe?.z2m.find(item => item.baseTopic === baseTopic && !item.leftBehind) ?? probe?.z2m.find(item => !item.leftBehind));
  async function refreshProbe() {busy = true; try {probe = await call("mqttProbe", {})} catch (error) {askError = error.message} busy = false}
  function gotNetwork(result) {network = result; files = result.files; chosen = result.devices.map(device => device.ieee); if (!path && result.adapterPath) path = result.adapterPath; if (result.adapterType) adapter = result.adapterType}
  // asking can take a while (Zigbee2MQTT zips its whole data folder): count the seconds, and keep any failure on the page
  let askError = $state(""), askStarted = $state(0);
  async function askZ2m() {busy = true; askError = ""; askStarted = Date.now(); try {gotNetwork(await call("z2mFetch", {baseTopic}))} catch (error) {askError = error.message} busy = false; askStarted = 0}
  async function pickFiles(fileList) {
    if (!fileList?.length) return; busy = true;
    askError = "";
    try {const picked = await readBackupFiles(fileList), preview = await call("z2mPreview", {files: picked}); gotNetwork(Object.assign({files: picked}, preview))} catch (error) {askError = error.message}
    busy = false;
  }
  const toggle = ieee => chosen = chosen.includes(ieee) ? chosen.filter(other => other !== ieee) : chosen.concat([ieee]);
  // 3 Adapter
  let path = $state(""), adapter = $state("ember"), checks = $state(null);
  const HINTS = {ember: {likely: "Network, then its IP address (port 6638)", likelyWhere: "for an adapter on your network (SMLIGHT and similar)", other: "USB, then /dev/ttyUSB0", otherWhere: "plugged into this machine (Sonoff E, SkyConnect)"}, zstack: {likely: "USB, then /dev/ttyUSB0", likelyWhere: "for an adapter plugged into this machine (Sonoff P, CC2652)", other: "Network, then its IP address (port 6638)", otherWhere: "on your network"}};
  let hint = $derived(HINTS[adapter]);
  // a changed address needs checking again
  $effect(() => {mqtt.url; probe = null; probeError = ""});
  $effect(() => {path; checks = null});
  // brief, read-only look at the adapter (nothing is sent, let go at once); when moving over, also whether Zigbee2MQTT has stopped
  async function checkAdapter() {
    busy = true;
    try {
      const result = await call("stickCheck", {path, adapter});
      if (from === "z2m" && snap.mqtt.settings.url) {const seen = await call("mqttProbe", {}).catch(() => null), z2m = seen?.z2m.find(item => item.baseTopic === baseTopic); if (z2m?.running) {result.checks.push({label: "Zigbee2MQTT", result: "bad", text: "is still running and using the adapter.", fix: "Stop it now (only one of them can use the adapter), then Check again."}); result.result = "bad"; result.headline = "Stop Zigbee2MQTT first"} else if (seen) result.checks.push({label: "Zigbee2MQTT", result: "ok", text: "has stopped."})}
      checks = result;
    } catch (error) {finishError = error.message}
    busy = false;
  }
  function useSuggestion(suggest) {if (suggest.path) path = suggest.path; if (suggest.adapter) adapter = suggest.adapter; checkAdapter()}
  let finishError = $state("");
  async function finish() {
    busy = true; finishError = "";
    try {
      if (from === "z2m") await act("z2mImport", {files, path, adapter, keepBaseTopic: true, devices: chosen});
      else await act("newNetwork", {path, adapter});
      view.wizard = false;
    } catch (error) {finishError = error.message}
    busy = false;
  }
</script>
<div class="wizard">
  <div class="brand"><img src="/icon.svg" width="44" alt=""><div><h1>Swarm2MQTT</h1><span class="muted">Zigbee2MQTT, but sensible.</span></div></div>
  <div class="steps"><span class:on={step === 1}>MQTT</span><span class:on={step === 2}>Zigbee2MQTT</span><span class:on={step === 3}>Adapter</span></div>
  {#if step === 1}
    <section class="card">
      <h2>Your MQTT server</h2>
      <p class="muted">First, because it's how Swarm2MQTT talks to the rest of your home. If you're moving from Zigbee2MQTT, it's also how Swarm2MQTT asks it for your network, so nothing needs copying by hand.</p>
      <AddressField bind:value={mqtt.url} kinds={MQTT_KINDS} onenter={() => {if (mqtt.url && !busy) connectMqtt()}}/>
      <div class="fieldhint">Your MQTT server's IP address or name. The port is usually 1883 (8883 for mqtts).</div>
      <div class="two"><input class="text" placeholder="User (if any)" bind:value={mqtt.username}><input class="text" type="password" placeholder="Password" bind:value={mqtt.password}></div>
      {#if probe}
        <div class="headline"><span class="big">✓</span>Connected to the MQTT server ({Math.max(1, probe.ms)} ms)</div>
        <ul class="checks">
          {#each probe.z2m as item}
            {#if item.leftBehind}<li class="old"><span class="mark">?</span><div><b>Zigbee2MQTT {item.version}</b> on topic <code>{item.baseTopic}</code> isn't answering.<div class="muted">An old install left its messages on your MQTT server{item.adapterPath ? ` (it used ${item.adapterPath})` : ""}. Nothing is running there now.</div><button class="link" onclick={() => clearOld(item.baseTopic)}>Remove its old messages</button></div></li>
            {:else}<li class={item.running ? "ok" : "warn"}><span class="mark">{item.running ? "✓" : "!"}</span><div><b>Zigbee2MQTT {item.version}</b> on topic <code>{item.baseTopic}</code>: {item.running ? "running, and it answered just now" : "stopped"}{item.adapterPath ? `, using ${item.adapterPath}` : ""}.</div></li>{/if}
          {:else}<li class="ok"><span class="mark">✓</span><div>No Zigbee2MQTT on this server. That's fine for a new network.</div></li>{/each}
        </ul>
      {:else if probeError}<div class="headline bad"><span class="big">✕</span>{probeError}</div>{/if}
      <div class="foot">
        {#if probe}<span class="spacer"></span>{:else}<button class="quiet" onclick={() => step = 2}>Skip for now</button>{/if}
        {#if probe}<button class="pill ghost" disabled={busy} onclick={connectMqtt}>{busy ? "Checking…" : "Check again"}</button><button class="pill primary" onclick={() => step = 2}>Next ›</button>
        {:else}<button class="pill primary" disabled={!mqtt.url || busy} onclick={connectMqtt}>{busy ? "Connecting…" : probeError ? "Try again" : "Connect"}</button>{/if}
      </div>
    </section>
  {:else if step === 2}
    <section class="card">
      <h2>Coming from Zigbee2MQTT?</h2>
      <div class="choice">
        <button class="option" class:on={from === "z2m"} onclick={() => from = "z2m"}><b>Yes, bring my network over</b><span class="muted">Same network, same devices, names and groups. Nothing is paired again.</span><span class="muted">You can switch back any time: stop one, start the other. Zigbee2MQTT's own files are never changed.</span></button>
        <button class="option" class:on={from === "new"} onclick={() => from = "new"}><b>No, start a new network</b><span class="muted">Every device must be paired again, one by one.</span><span class="muted">A device belongs to one network at a time, so pairing it here takes it off the old one.</span></button>
      </div>
      {#if from === "z2m" && !network}
        {#if !byFiles && snap.mqtt.settings.url}
          {#if found?.running}
            <p>Swarm2MQTT asks Zigbee2MQTT {found.version} for a copy of its network, devices and groups. It keeps running, and nothing of it changes.</p>
            {#if askError}<div class="headline bad"><span class="big">✕</span><div>Didn't get your network<div class="why">{askError}</div></div></div>{/if}
            <div class="actions"><button class="pill primary" disabled={busy} onclick={askZ2m}>{busy ? "Asking Zigbee2MQTT…" : askError ? "Try again" : "Get my network from Zigbee2MQTT"}</button>{#if askStarted}<span class="muted waiting">Zigbee2MQTT is making its backup… {Math.round((view.now - askStarted) / 1000)} s (it can take a minute)</span>{/if}</div>
            <div class="alt">Can't use MQTT? <button onclick={() => byFiles = true}>Drop its files instead</button></div>
          {:else}
            <div class="headline warn"><span class="big">!</span>{found ? "Zigbee2MQTT is stopped" : "No Zigbee2MQTT on your MQTT server"}</div>
            <p class="muted">{found ? "Start it again for a minute, so it can hand over its network. You'll stop it again before the last step." : "Start it if it's stopped. If it uses its own topic, type it here."}</p>
            {#if !found}<label class="topic"><span class="muted">Zigbee2MQTT's topic</span><input class="text" bind:value={baseTopic}></label>{/if}
            <div class="actions"><button class="pill ghost" disabled={busy} onclick={refreshProbe}>{busy ? "Looking…" : "Check again"}</button>{#if !found}<button class="pill ghost" disabled={busy} onclick={askZ2m}>Ask anyway</button>{/if}</div>
            <div class="alt">Can't use MQTT? <button onclick={() => byFiles = true}>Drop its files instead</button></div>
          {/if}
        {:else}
          <p>From Zigbee2MQTT's data folder, drop <b>configuration.yaml</b>, <b>database.db</b> and <b>coordinator_backup.json</b> here (and secret.yaml if you use one). A zip of the folder works too.</p>
          {#if askError}<div class="headline bad"><span class="big">✕</span><div>Couldn't read those files<div class="why">{askError}</div></div></div>{/if}
          <label class="drop" class:dragging ondragover={event => {event.preventDefault(); dragging = true}} ondragleave={() => dragging = false} ondrop={event => {event.preventDefault(); dragging = false; pickFiles(event.dataTransfer.files)}}>
            <input type="file" multiple accept=".zip,.yaml,.db,.json" hidden onchange={event => pickFiles(event.currentTarget.files)}>
            {busy ? "Reading…" : "Drop the files here, or click to pick them"}
          </label>
          {#if snap.mqtt.settings.url}<div class="alt"><button onclick={() => byFiles = false}>Ask Zigbee2MQTT over MQTT instead</button></div>{/if}
        {/if}
      {/if}
      {#if from === "z2m" && network}
        <div class="headline"><span class="big">✓</span>Got your network: {network.summary}</div>
        {#if network.devices.length}
          <div class="listhead"><b>Devices to bring over</b><span class="muted">{chosen.length} of {network.devices.length}</span><button class="link" onclick={() => chosen = chosen.length === network.devices.length ? [] : network.devices.map(device => device.ieee)}>{chosen.length === network.devices.length ? "None" : "All"}</button></div>
          <ul class="devices">{#each network.devices as device (device.ieee)}<li><label><input type="checkbox" checked={chosen.includes(device.ieee)} onchange={() => toggle(device.ieee)}><span>{device.name}</span><span class="muted">{device.model ?? ""}</span></label></li>{/each}</ul>
          <p class="muted small">Unticked devices stay on the network and wait in Waiting for you, sending nothing, until you accept them.</p>
        {/if}
        {#if network.groups?.length}<p class="muted small">Groups: {network.groups.join(", ")}</p>{/if}
        <div class="alt"><button onclick={() => {network = null; files = null}}>Get it again</button></div>
      {/if}
      <div class="foot"><button class="quiet" onclick={() => step = 1}>‹ Back</button><button class="pill primary" disabled={!from || (from === "z2m" && !network)} onclick={() => step = 3}>Next ›</button></div>
    </section>
  {:else}
    <section class="card">
      <h2>Where is your Zigbee adapter?</h2>
      {#if from === "z2m" && network?.adapterPath}<p class="muted">Filled in from Zigbee2MQTT.</p>{/if}
      <div class="seg"><button class:on={adapter === "ember"} onclick={() => {adapter = "ember"; checks = null}}>Ember (Sonoff E, SMLIGHT, SkyConnect)</button><button class:on={adapter === "zstack"} onclick={() => {adapter = "zstack"; checks = null}}>Z-Stack (Sonoff P, CC2652)</button></div>
      {#key adapter}<AddressField bind:value={path} kinds={ADAPTER_KINDS} defaultKind={adapter === "zstack" && !path ? 1 : 0} onenter={() => {if (path && !busy) checkAdapter()}}/>{/key}
      <div class="callout info hint"><span class="t">Most likely, {hint.likelyWhere}: {hint.likely}.<br>Or, {hint.otherWhere}: {hint.other}.</span></div>
      {#if from === "z2m"}<div class="callout info"><span class="t">Stop Zigbee2MQTT now: only one of them can use the adapter. The check below tells you if it's still running.</span></div>{/if}
      {#if checks}
        <div class="headline {checks.result}"><span class="big">{checks.result === "bad" ? "✕" : "✓"}</span>{checks.headline}</div>
        <ul class="checks">
          {#each checks.checks as check}<li class={check.result}><span class="mark">{check.result === "ok" ? "✓" : check.result === "warn" ? "!" : "✕"}</span><div><b>{check.label}</b> {check.text}{#if check.fix}<div class="muted">{check.fix}</div>{/if}{#if check.suggest}<button class="link" onclick={() => useSuggestion(check.suggest)}>Use {check.suggest.path ?? (check.suggest.adapter === "zstack" ? "Z-Stack" : "Ember")}</button>{/if}</div></li>{/each}
        </ul>
      {/if}
      {#if finishError}<div class="headline bad"><span class="big">✕</span><div>{from === "z2m" ? "Couldn't bring it over" : "Couldn't make the network"}<div class="why">{finishError}</div></div></div>{/if}
      <div class="foot">
        <button class="quiet" onclick={() => step = 2}>‹ Back</button>
        {#if !checks}<button class="pill primary" disabled={!path || path.includes("<") || busy} onclick={checkAdapter}>{busy ? "Checking…" : "Check the adapter"}</button>
        {:else}
          <button class="pill ghost" disabled={busy} onclick={checkAdapter}>{busy ? "Checking…" : "Check again"}</button>
          {#if checks.result === "bad"}<button class="pill ghost" disabled={busy} onclick={finish}>Carry on anyway</button>
          {:else}<button class="pill primary" disabled={busy} onclick={finish}>{from === "z2m" ? "Bring it over" : "Make the network"}</button>{/if}
        {/if}
      </div>
    </section>
  {/if}
</div>
<style>
  .wizard{max-width:620px;margin:0 auto;padding:40px 16px calc(80px + var(--status-h));display:flex;flex-direction:column;gap:18px}
  .brand{display:flex;gap:14px;align-items:center}
  h1{font-size:1.9rem;font-weight:300}
  .steps{display:flex;gap:18px;color:var(--faint)}.steps .on{color:var(--text);font-weight:500}
  section{padding:18px;display:flex;flex-direction:column;gap:12px}
  h2{font-size:18px;font-weight:500;display:flex;gap:10px;align-items:center}
  h2 span{font-size:14px;font-weight:400}.ok{color:var(--green)}.bad{color:var(--red)}
  .choice{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .option{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px;border-radius:14px;border:1px solid var(--glass-border);background:var(--glass)}
  .option.on{box-shadow:inset 0 0 0 1.5px var(--active-border);background:color-mix(in srgb,var(--accent) 14%,transparent)}
  .option span{font-size:13.5px}
  .two,.row{display:flex;gap:8px}
  .pill{align-self:flex-start}
  .link{color:var(--accent);align-self:flex-start}
  /* every step ends with one footer: Back (or Skip) quiet on the left, actions on the right, all on one centre line */
  .foot{display:flex;align-items:center;gap:10px;margin-top:6px;padding-top:16px;border-top:1px solid var(--glass-border)}
  .foot .quiet,.foot .spacer{margin-right:auto}
  .quiet{color:var(--muted);font-size:14.5px;padding:7px 4px}.quiet:hover{color:var(--text)}
  .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .foot .pill,.actions .pill{align-self:auto}
  .why{font-size:14px;font-weight:400;color:var(--muted);margin-top:4px}
  .waiting{font-size:14px}
  .alt{font-size:13.5px;color:var(--muted);margin-top:-4px}.alt button{color:var(--accent);font-size:13.5px}
  .headline{display:flex;align-items:center;gap:12px;font-size:17px;font-weight:500;padding:12px 14px;border-radius:14px;color:var(--text);background:color-mix(in srgb,var(--green) 14%,transparent);border:1px solid color-mix(in srgb,var(--green) 45%,transparent)}
  .headline.warn{background:color-mix(in srgb,var(--amber) 14%,transparent);border-color:color-mix(in srgb,var(--amber) 45%,transparent)}
  .headline.bad{background:color-mix(in srgb,var(--red) 14%,transparent);border-color:color-mix(in srgb,var(--red) 45%,transparent)}
  .big{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:16px;font-weight:700;color:var(--on-tint);background:var(--green)}
  .headline.warn .big{background:var(--amber)}.headline.bad .big{background:var(--red)}
  .checks li.ok,.checks li.warn,.checks li.bad{color:var(--text)}
  .checks{list-style:none;display:flex;flex-direction:column;gap:8px}
  .checks li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px}
  .checks .muted{font-size:13.5px}
  .mark{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--on-tint)}
  .checks li.old{color:var(--muted)}.old .mark{background:var(--glass-hover);color:var(--text)}
  .ok .mark{background:var(--green)}.warn .mark{background:var(--amber)}.bad .mark{background:var(--red)}
  .row{align-items:center}
  .topic{display:flex;align-items:center;gap:10px;font-size:14px}.topic .text{max-width:220px}
  .hint code,.callout code{font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap}
  .howto{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px;font-size:14.5px}
  .drop{display:flex;align-items:center;justify-content:center;min-height:84px;padding:12px;border-radius:14px;border:1.5px dashed var(--glass-border);cursor:pointer;color:var(--muted);text-align:center}
  .drop.dragging,.drop:hover{border-color:var(--accent);color:var(--text)}
  .listhead{display:flex;align-items:center;gap:10px}
  .devices{list-style:none;max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:14px;border:1px solid var(--glass-border)}
  .devices label{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:10px;cursor:pointer}
  .devices label:hover{background:var(--glass-hover)}
  .devices .muted{margin-left:auto;font-size:13px}
  .small{font-size:13.5px}
  .checks code,.checks li code{font-family:ui-monospace,monospace;font-size:13px}
  @media (max-width:700px){.choice{grid-template-columns:1fr}}
</style>
