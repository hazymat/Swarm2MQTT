<script>
  // App update bar, bottom centre on every page (setup too), stacked between the selection bar and the pills. "Later" hides it until the next version.
  import {live, act} from "./api.svelte.js";
  import {view, save} from "./ui.svelte.js";
  let {inset = false} = $props();
  let update = $derived(live.snap?.update ?? {});
  // pressed Update now: stay "Updating…" (through the restart too) until the new version's page loads
  let pressed = $state(""), updating = $derived(!!update.running || !!pressed);
  let showing = $derived(updating || (!!update.available && view.updateLater !== update.latest));
  async function updateNow() {pressed = update.latest; try {await act("updateNow")} catch {pressed = ""}}
  $effect(() => {document.body.classList.toggle("has-update", showing)});
</script>
{#if showing}
  <div class="updatebar" class:inset>
    <span class="dot pulse"></span><span class="message"><span class="name">Swarm2MQTT </span>{updating ? `Updating to ${pressed || update.latest}…` : `${update.latest} is out`}</span>
    {#if !updating}<button class="later" onclick={() => {view.updateLater = update.latest; save("s2m-update-later", update.latest)}}>Later</button><button class="now" onclick={updateNow}>Update now</button>{/if}
  </div>
{/if}
<style>
  .updatebar{position:fixed;left:50%;bottom:calc(var(--float-base) + var(--sel-lift));transform:translateX(-50%);z-index:28;display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;font-size:14px;background:color-mix(in srgb,var(--sheet) 94%,transparent);border:1px solid var(--active-border);border-radius:999px;box-shadow:var(--shadow);max-width:calc(100vw - 24px);white-space:nowrap}
  .updatebar.inset{left:calc(50% + 116px)}
  @media (max-width:700px){.updatebar.inset{left:50%}}
  .message{overflow:hidden;text-overflow:ellipsis}
  @media (max-width:700px){.name{display:none}}
  .dot{width:9px;height:9px;border-radius:50%;background:#4CC2FF;flex:none}
  .pulse{animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  button{padding:4px 13px;font-size:14px;font-weight:600;border-radius:18px;flex:none}
  .later{color:var(--muted)}
  .now{background:var(--active-bg, color-mix(in srgb,var(--accent) 22%,transparent));border:1px solid var(--active-border);color:var(--text)}
</style>
