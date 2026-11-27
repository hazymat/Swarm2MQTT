<script>
  import {live, act, call, toast} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  import {readBackupZip} from "./z2mzip.js";
  let step = $state(1), path = $state(""), adapter = $state("ember"), from = $state(null), files = $state(null), fileName = $state(""), preview = $state(null), busy = $state(false), dragging = $state(false);
  let mqtt = $state({url: "", username: "", password: ""}), checks = $state(null);
  // brief, read-only look at the adapter: nothing is sent to it and it's let go at once, so Zigbee2MQTT can still use it
  async function checkStick() {busy = true; try {checks = await call("stickCheck", {path, adapter})} catch (error) {toast(error.message, null, "bad")} busy = false}
  function useSuggestion(suggest) {if (suggest.path) path = suggest.path; if (suggest.adapter) adapter = suggest.adapter; checkStick()}
  view.wizard = true;
  const HINTS = {ember: {likely: "tcp://<IP address>:6638", likelyWhere: "for an adapter on your network (SMLIGHT and similar)", other: "/dev/ttyUSB0", otherWhere: "plugged into this machine (Sonoff E, SkyConnect)"}, zstack: {likely: "/dev/ttyUSB0", likelyWhere: "for an adapter plugged into this machine (Sonoff P, CC2652)", other: "tcp://<IP address>:6638", otherWhere: "on your network"}};
  let hint = $derived(HINTS[adapter]);
  async function pickZip(file) {
    if (!file) return; busy = true; preview = null; fileName = file.name;
    try {files = await readBackupZip(file); preview = await call("z2mPreview", {files})} catch (error) {files = null; toast(error.message, null, "bad")}
    busy = false;
  }
  async function importZ2m() {busy = true; try {await act("z2mImport", {files, path, adapter, keepBaseTopic: true}); goMqtt()} catch {} busy = false}
  async function newNetwork() {busy = true; try {await act("newNetwork", {path, adapter}); goMqtt()} catch {} busy = false}
  function goMqtt() {step = 3}
  // an import may bring Zigbee2MQTT's MQTT server: fill it in once it arrives
  let prefilled = false;
  $effect(() => {const settings = live.snap.mqtt.settings; if (step === 3 && !prefilled && settings?.url) {prefilled = true; mqtt = {url: settings.url, username: settings.username ?? "", password: settings.password ?? ""}}});
  async function saveMqtt() {await act("mqtt", {url: mqtt.url, username: mqtt.username, password: mqtt.password}).catch(() => {})}
  let snap = $derived(live.snap);
</script>
<div class="wizard">
  <div class="brand"><img src="/icon.svg" width="44" alt=""><div><h1>Swarm2MQTT</h1><span class="muted">Zigbee2MQTT, but sensible.</span></div></div>
  <div class="steps"><span class:on={step === 1}>Adapter</span><span class:on={step === 2}>Network</span><span class:on={step === 3}>MQTT</span></div>
  {#if step === 1}
    <section class="card">
      <h2>Where is your Zigbee adapter?</h2>
      <div class="seg"><button class:on={adapter === "ember"} onclick={() => {adapter = "ember"; checks = null}}>Ember (Sonoff E, SMLIGHT, SkyConnect)</button><button class:on={adapter === "zstack"} onclick={() => {adapter = "zstack"; checks = null}}>Z-Stack (Sonoff P, CC2652)</button></div>
      <input class="text" placeholder={hint.likely} bind:value={path} oninput={() => checks = null} onkeydown={event => {if (event.key === "Enter" && path && !busy) checkStick()}}>
      <div class="callout info hint"><span class="t">Most likely, {hint.likelyWhere}: <code>{hint.likely}</code><br>Or, {hint.otherWhere}: <code>{hint.other}</code></span></div>
      {#if checks}
        <div class="headline {checks.result}"><span class="big">{checks.result === "bad" ? "✕" : "✓"}</span>{checks.headline}</div>
        <ul class="checks">
          {#each checks.checks as check}<li class={check.result}><span class="mark">{check.result === "ok" ? "✓" : check.result === "warn" ? "!" : "✕"}</span><div><b>{check.label}</b> {check.text}{#if check.fix}<div class="muted">{check.fix}</div>{/if}{#if check.suggest}<button class="link" onclick={() => useSuggestion(check.suggest)}>Use {check.suggest.path ?? (check.suggest.adapter === "zstack" ? "Z-Stack" : "Ember")}</button>{/if}</div></li>{/each}
        </ul>
        <div class="row">
          <button class="pill ghost" disabled={busy} onclick={checkStick}>{busy ? "Checking…" : "Check again"}</button>
          {#if checks.result === "bad"}<button class="link" onclick={() => step = 2}>Carry on anyway ›</button>{:else}<button class="pill primary" onclick={() => step = 2}>Next</button>{/if}
        </div>
      {:else}<button class="pill primary" disabled={!path || path.includes("<") || busy} onclick={checkStick}>{busy ? "Checking…" : "Check the adapter"}</button>{/if}
    </section>
  {:else if step === 2}
    <section class="card">
      <h2>Coming from Zigbee2MQTT?</h2>
      <div class="choice">
        <button class="option" class:on={from === "z2m"} onclick={() => from = "z2m"}><b>Yes, bring my network over</b><span class="muted">Same network, same devices, names and groups. Nothing is paired again.</span><span class="muted">You can switch back any time: stop one, start the other. Zigbee2MQTT's own files are never changed.</span></button>
        <button class="option" class:on={from === "new"} onclick={() => from = "new"}><b>No, start a new network</b><span class="muted">Every device must be paired again, one by one.</span><span class="muted">A device belongs to one network at a time, so pairing it here takes it off the old one.</span></button>
      </div>
      {#if from === "z2m"}
        <ol class="howto">
          <li>Open Zigbee2MQTT's web page. If you've stopped it, start it again for a minute.</li>
          <li>Go to <b>Settings &gt; Tools &gt; Request Zigbee2MQTT backup</b>. A zip downloads.</li>
          <li>Stop Zigbee2MQTT. Only one of them can use the adapter.</li>
          <li>Drop the zip here.</li>
        </ol>
        <label class="drop" class:dragging ondragover={event => {event.preventDefault(); dragging = true}} ondragleave={() => dragging = false} ondrop={event => {event.preventDefault(); dragging = false; pickZip(event.dataTransfer.files[0])}}>
          <input type="file" accept=".zip,application/zip" hidden onchange={event => pickZip(event.currentTarget.files[0])}>
          {#if busy && !preview}Reading {fileName}…{:else if preview}✓ {fileName}{:else}Drop the zip here, or click to pick it{/if}
        </label>
        {#if preview}<div class="callout info"><span class="t">Found {preview.summary}{preview.hasMqtt ? ", and the MQTT server" : ""}. The adapter from the first step is used: <code>{path}</code></span></div>
          <button class="pill primary" disabled={busy} onclick={importZ2m}>Bring it over</button>{/if}
      {:else if from === "new"}<button class="pill primary" disabled={busy} onclick={newNetwork}>Make the network</button>{/if}
      <button class="link" onclick={() => step = 1}>‹ Back</button>
    </section>
  {:else}
    <section class="card">
      <h2>MQTT server {#if snap.mqtt.connected}<span class="ok">✓ Connected</span>{:else if snap.mqtt.error}<span class="bad">{snap.mqtt.error}</span>{/if}</h2>
      <input class="text" placeholder="mqtt://192.168.1.10:1883" bind:value={mqtt.url}>
      <div class="two"><input class="text" placeholder="User" bind:value={mqtt.username}><input class="text" type="password" placeholder="Password" bind:value={mqtt.password}></div>
      <div class="row"><button class="pill ghost" disabled={!mqtt.url} onclick={saveMqtt}>Connect</button><button class="pill primary" onclick={() => view.wizard = false}>{snap.mqtt.connected ? "Done" : "Skip, I'll do it later"}</button></div>
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
  .ok .mark{background:var(--green)}.warn .mark{background:var(--amber)}.bad .mark{background:var(--red)}
  .row{align-items:center}
  .hint code,.callout code{font-family:ui-monospace,monospace;font-size:13px;white-space:nowrap}
  .howto{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px;font-size:14.5px}
  .drop{display:flex;align-items:center;justify-content:center;min-height:84px;padding:12px;border-radius:14px;border:1.5px dashed var(--glass-border);cursor:pointer;color:var(--muted);text-align:center}
  .drop.dragging,.drop:hover{border-color:var(--accent);color:var(--text)}
  @media (max-width:700px){.choice{grid-template-columns:1fr}}
</style>
