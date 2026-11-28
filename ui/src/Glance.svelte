<script>
  // The strip above the list: one card per kind of device. Tapping one opens that device, or scrolls to the first of several.
  import {view} from "./ui.svelte.js";
  import {glance, TONE} from "./summary.js";
  let {devices} = $props();
  let cards = $derived(glance(devices));
  function show(card) {
    if (card.devices.length === 1) {view.open = card.devices[0].device.ieee; return}
    const element = document.getElementById("dev-" + card.devices[0].device.ieee); if (!element) return;
    element.scrollIntoView({block: "center", behavior: "smooth"}); element.classList.remove("flash"); void element.offsetWidth; element.classList.add("flash");
  }
</script>
{#if cards.length}<div class="strip">{#each cards as card (card.key)}<button class="g" style="border-color:{card.tone === "plain" ? "var(--glass-border)" : `color-mix(in srgb,${TONE[card.tone]} 45%,transparent)`}" onclick={() => show(card)}><span class="gl">{card.label}</span><span class="gv" style="color:{TONE[card.tone]}">{card.value}</span><span class="gs">{card.sub}</span></button>{/each}</div>{/if}
<style>
  .strip{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -2px;padding:0 2px 2px;flex:none}
  .strip::-webkit-scrollbar{display:none}
  .g{flex:none;width:132px;padding:10px 12px;border-radius:16px;background:var(--glass);border:1px solid var(--glass-border);display:flex;flex-direction:column;gap:3px;text-align:left}
  .gl{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gv{font-size:21px;font-weight:300;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gs{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
