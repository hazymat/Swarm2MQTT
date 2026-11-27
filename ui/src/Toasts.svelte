<script>
  import {live, dismiss, cancelPending} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  const CIRCLE = 40.8;
</script>
<div class="stack" class:lifted={view.chosen.length > 0}>
  {#each live.toasts as item (item.id)}
    <div class="toast" class:bad={item.level === "bad"}>
      <svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(-90deg)"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--glass-hover)" stroke-width="2.6"/><circle class="ring" cx="8" cy="8" r="6.5" fill="none" stroke={item.level === "bad" ? "var(--red)" : "var(--accent)"} stroke-width="2.6" stroke-dasharray={CIRCLE} stroke-linecap="round" style="animation-duration:{item.ms}ms"/></svg>
      <span>{item.label}</span>
      {#if item.then}<button onclick={() => cancelPending(item.id)}>Undo</button>
      {:else if item.action}<button onclick={() => {dismiss(item.id); item.action()}}>Undo<kbd>Ctrl Z</kbd></button>{/if}
    </div>
  {/each}
</div>
<style>
  .stack{position:fixed;left:calc(50% + 116px);bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:30;pointer-events:none}
  .stack.lifted{bottom:86px}
  .toast{pointer-events:auto;display:flex;align-items:center;gap:12px;padding:8px 10px 8px 16px;font-size:14.5px;background:color-mix(in srgb,var(--sheet) 94%,transparent);border:1px solid var(--active-border);border-radius:999px;box-shadow:var(--shadow);white-space:nowrap;max-width:calc(100vw - 32px)}
  .toast span{overflow:hidden;text-overflow:ellipsis}
  .toast.bad{border-color:color-mix(in srgb,var(--red) 60%,transparent);white-space:normal}
  .toast button{padding:4px 13px;font-size:14px;font-weight:600;color:var(--accent);border:1px solid var(--glass-border);border-radius:18px;flex:none}
  .ring{animation:empty linear forwards}
  @keyframes empty{from{stroke-dashoffset:0}to{stroke-dashoffset:40.8}}
  @media (max-width:700px){.stack{left:50%;bottom:92px}.stack.lifted{bottom:150px}}
</style>
