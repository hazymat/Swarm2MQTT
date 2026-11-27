<script>
  import {live, act} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  let left = $derived(Math.max(0, Math.round((live.snap.join.endsAt - view.now) / 1000)));
  const TOTAL = 240, CIRCLE = 69.1;
</script>
<span class="joinpill" title="New devices can join while this is open">
  <svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="11" fill="none" stroke="color-mix(in srgb,var(--amber) 30%,transparent)" stroke-width="3.5"/><circle cx="15" cy="15" r="11" fill="none" stroke="var(--amber)" stroke-width="3.5" stroke-dasharray={CIRCLE} stroke-dashoffset={CIRCLE * (1 - Math.min(1, left / TOTAL))} transform="rotate(-90 15 15)" stroke-linecap="round"/></svg>
  <span class="t">Open for new devices · {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
  <button class="stop" onclick={() => act("join", {seconds: 0})}>Stop<kbd>Esc</kbd></button>
</span>
<style>
  .joinpill{display:inline-flex;align-items:center;gap:10px;padding:5px 6px;border-radius:24px;background:color-mix(in srgb,var(--amber) 16%,transparent);border:1px solid color-mix(in srgb,var(--amber) 60%,transparent);font-weight:500;white-space:nowrap}
  .stop{background:var(--glass);border:1px solid var(--glass-border);border-radius:18px;padding:4px 12px;font-size:14px}
  @media (max-width:700px){.t{font-size:13px}}
</style>
