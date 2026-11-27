<script>
  import {live, act} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  import Pic from "./Pic.svelte";
  let snap = $derived(live.snap);
  let found = $derived(snap.join.found.map(ieee => snap.devices.find(device => device.ieee === ieee)).filter(Boolean));
</script>
<div class="card joinbox">
  <h4><svg width="18" height="18" viewBox="0 0 18 18"><rect x="3" y="8" width="12" height="9" rx="2" fill="var(--amber)"/><path d="M6 8V5a3 3 0 0 1 6 0" fill="none" stroke="var(--amber)" stroke-width="2"/></svg>Open for new devices</h4>
  {#if live.rejoin}<div class="callout info"><span class="t">Waiting for <b>{live.rejoin.name}</b> to come back. Put it in pairing mode and it gets its old name and settings.</span></div>{/if}
  <p>Put your device in pairing mode now. Usually: hold its button for 5 seconds until it blinks.</p>
  <div class="warn"><span>⚠</span><span>While this is on, any device nearby can join and is handed your network key, including a neighbour's. It turns itself off after 4 minutes; stop it once your device is in.</span></div>
  <div class="found">
    {#each found as device (device.ieee)}
      <div class="kv">
        <span class="who"><Pic {device} size={32}/>{device.name}</span>
        {#if device.status === "waiting"}<span class="acts"><button class="pill" style="background:var(--mint)" onclick={() => act("accept", {ieee: device.ieee})}>Accept</button><button class="pill ghost" onclick={() => view.open = device.ieee}>Look first</button></span>
        {:else if !device.controls.length}<span class="muted">Getting to know it…</span>
        {:else}<span style="color:var(--green)">Ready</span>{/if}
      </div>
    {:else}<div class="muted listening">Listening…</div>{/each}
  </div>
  <button class="pill ghost stop" onclick={() => act("join", {seconds: 0})}>Stop<kbd>Esc</kbd></button>
</div>
<style>
  .joinbox{padding:16px;border-color:color-mix(in srgb,var(--amber) 55%,transparent);display:flex;flex-direction:column;gap:10px}
  h4{font-size:17px;font-weight:500;display:flex;gap:8px;align-items:center}
  p{color:var(--muted);font-size:14px}
  .warn{display:flex;gap:9px;background:color-mix(in srgb,var(--amber) 14%,transparent);border-radius:12px;padding:9px 11px;font-size:13.5px}
  .found{display:flex;flex-direction:column}
  .found .kv{padding:6px 0;border-top:1px solid var(--glass-border)}
  .who{display:flex;align-items:center;gap:10px}
  .acts{display:flex;gap:6px}
  .listening{padding:8px 0;animation:fade 1.6s ease-in-out infinite}
  @keyframes fade{50%{opacity:.4}}
  .stop{align-self:flex-start}
</style>
