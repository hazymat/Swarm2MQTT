<script>
  // Slim bar along the bottom of every page: the version (opens What's new) and, when one is out, the newer version (brings back the update bar)
  import {live} from "./api.svelte.js";
  import {view, save} from "./ui.svelte.js";
  let snap = $derived(live.snap), update = $derived(snap?.update ?? {});
</script>
<footer id="statusbar">
  <button onclick={() => {view.whatsNewAll = true; view.whatsNew = true}} title="What's new">Swarm2MQTT {snap.version}{snap.prefs?.updateChannel === "dev" ? " · Dev" : ""}</button>
  {#if update.available}<button class="out" onclick={() => {view.updateLater = ""; save("s2m-update-later", "")}}><span class="dot"></span>{update.latest} is out</button>{/if}
</footer>
<style>
  #statusbar{position:fixed;left:0;right:0;bottom:0;height:var(--status-h);z-index:12;display:flex;align-items:center;gap:16px;padding:0 14px;font-size:12px;color:var(--muted);background:var(--bar);border-top:1px solid var(--glass-border);backdrop-filter:blur(20px)}
  button{color:inherit;font-size:12px;display:inline-flex;align-items:center;gap:6px}
  button:hover{color:var(--text)}
  .out{margin-left:auto}
  .dot{width:7px;height:7px;border-radius:50%;background:#4CC2FF}
</style>
