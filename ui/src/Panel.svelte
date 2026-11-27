<script>
  // Settings panel, as in Quizaroo: title and a one-line status; tap to open; which ones are open is remembered on this device
  import {save} from "./ui.svelte.js";
  let {key, title, status = "", tone = "", id = undefined, children} = $props(); // tone "bad": opens by itself, so a fault is never hidden
  const remembered = (() => {try {return JSON.parse(localStorage.getItem("s2m-panels")) ?? {}} catch {return {}}})();
  let open = $state(!!remembered[key] || tone === "bad");
  function toggled(event) {open = event.currentTarget.open; let all = {}; try {all = JSON.parse(localStorage.getItem("s2m-panels")) ?? {}} catch {} all[key] = open; save("s2m-panels", all)}
</script>
<details class="panel" {id} {open} ontoggle={toggled}>
  <summary><span class="title">{title}</span>{#if status}<span class="status {tone}">{status}</span>{/if}</summary>
  {#if open}<div class="body">{@render children()}</div>{/if}
</details>
<style>
  .panel{background:var(--glass);border:1px solid var(--glass-border);border-radius:14px}
  summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:12px 16px 12px 34px;position:relative;cursor:pointer;list-style:none}
  summary::-webkit-details-marker{display:none}
  summary::before{content:"";position:absolute;left:15px;top:19px;width:7px;height:7px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);transition:transform .15s}
  .panel[open]>summary::before{transform:rotate(45deg);top:17px}
  .title{font-size:17px;font-weight:500}
  .status{min-width:0;color:var(--muted);font-size:14px;overflow-wrap:anywhere}.status.ok{color:var(--green)}.status.bad{color:var(--red)}.status.blue{color:var(--blue)}
  .body{padding:0 16px 14px;display:flex;flex-direction:column;gap:6px}
</style>
