<script>
  import {live, act, call, toast} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  let step = $state(1), path = $state(""), adapter = $state("ember"), from = $state(null), folder = $state(""), preview = $state(null), busy = $state(false);
  let mqtt = $state({url: "", username: "", password: ""});
  view.wizard = true;
  async function useZ2m() {busy = true; try {preview = await call("z2mPreview", {folder})} catch (error) {toast(error.message, null, "bad")} busy = false}
  async function importZ2m() {busy = true; try {await act("z2mImport", {folder, keepBaseTopic: true}); step = 3} catch {} busy = false}
  async function newNetwork() {busy = true; try {await act("newNetwork", {path, adapter}); step = 3} catch {} busy = false}
  async function saveMqtt() {await act("mqtt", {url: mqtt.url, username: mqtt.username, password: mqtt.password}).catch(() => {})}
  let snap = $derived(live.snap);
</script>
<div class="wizard">
  <div class="brand"><img src="/icon.svg" width="44" alt=""><div><h1>Swarm2MQTT</h1><span class="muted">Zigbee2MQTT, but sensible.</span></div></div>
  <div class="steps"><span class:on={step === 1}>Stick</span><span class:on={step === 2}>Network</span><span class:on={step === 3}>MQTT</span></div>
  {#if step === 1}
    <section class="card">
      <h2>Where is your Zigbee stick?</h2>
      <input class="text" placeholder="/dev/ttyUSB0, or tcp://192.168.1.20:6638 for a network stick" bind:value={path}>
      <div class="seg"><button class:on={adapter === "ember"} onclick={() => adapter = "ember"}>Ember (Sonoff E, SMLIGHT, SkyConnect)</button><button class:on={adapter === "zstack"} onclick={() => adapter = "zstack"}>Z-Stack (Sonoff P, CC2652)</button></div>
      <button class="pill primary" disabled={!path} onclick={() => step = 2}>Next</button>
    </section>
  {:else if step === 2}
    <section class="card">
      <h2>Coming from Zigbee2MQTT?</h2>
      <div class="choice">
        <button class="option" class:on={from === "z2m"} onclick={() => from = "z2m"}><b>Yes</b><span class="muted">Bring the network, devices, names and groups over. Nothing needs pairing again.</span></button>
        <button class="option" class:on={from === "new"} onclick={() => from = "new"}><b>No</b><span class="muted">Start a new network. Its keys are made for you and never shown.</span></button>
      </div>
      {#if from === "z2m"}
        <input class="text" placeholder="Zigbee2MQTT data folder on this machine, e.g. /opt/zigbee2mqtt/data" bind:value={folder}>
        {#if preview}<div class="callout info"><span class="t">Found {preview.summary}. Stop Zigbee2MQTT before importing: only one can use the stick. Its folder is only read, so going back always works.</span></div>
          <button class="pill primary" disabled={busy} onclick={importZ2m}>Import</button>
        {:else}<button class="pill primary" disabled={!folder || busy} onclick={useZ2m}>Look in this folder</button>{/if}
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
  .wizard{max-width:620px;margin:0 auto;padding:40px 16px;display:flex;flex-direction:column;gap:18px}
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
  @media (max-width:700px){.choice{grid-template-columns:1fr}}
</style>
