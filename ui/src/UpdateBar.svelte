<script>
  // App update bar, on every page (setup too): blue pulsing dot, one tap to update. "Later" hides it until the next version.
  import {live, act} from "./api.svelte.js";
  let hidden = $state((() => {try {return localStorage.getItem("s2m-update-later") ?? ""} catch {return ""}})());
  let update = $derived(live.snap?.update ?? {});
  function later() {hidden = update.latest; try {localStorage.setItem("s2m-update-later", hidden)} catch {}}
</script>
{#if update.available && (hidden !== update.latest || update.running)}
  <div class="updatebar">
    <span class="dot pulse"></span><span class="message">{update.running ? `Updating to ${update.latest}…` : `Swarm2MQTT ${update.latest} is out`}</span>
    {#if !update.running}<button class="later" onclick={later}>Later</button><button class="now" onclick={() => act("updateNow").catch(() => {})}>Update now</button>{/if}
  </div>
{/if}
<style>
  .updatebar{position:fixed;bottom:24px;right:24px;z-index:40;display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;font-size:14px;background:color-mix(in srgb,var(--sheet) 94%,transparent);border:1px solid var(--active-border);border-radius:999px;box-shadow:var(--shadow);max-width:calc(100vw - 32px)}
  .message{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dot{width:9px;height:9px;border-radius:50%;background:#4CC2FF;flex:none}
  .pulse{animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  button{padding:4px 13px;font-size:14px;font-weight:600;border-radius:18px;flex:none}
  .later{color:var(--muted)}
  .now{color:#fff;background:var(--accent)}
  @media (max-width:700px){.updatebar{top:auto;bottom:152px;left:16px;right:16px;justify-content:space-between}}
</style>
