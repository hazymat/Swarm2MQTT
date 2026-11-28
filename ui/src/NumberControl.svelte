<script>
  // A number the device lets you change: − / slider / value / +. Shows the value live while dragging; presses are gathered and sent once you pause.
  import {valueText} from "./util.js";
  let {control, value, onset} = $props();
  let draft = $state(null), timer;
  let step = $derived(control.step ?? 1), shownValue = $derived(draft ?? value ?? control.min ?? 0);
  const clamp = number => Math.min(control.max ?? Infinity, Math.max(control.min ?? -Infinity, Math.round(number / step) * step));
  function send(number, later) {draft = Number(clamp(number).toFixed(4)); clearTimeout(timer); timer = setTimeout(() => {onset(draft); draft = null}, later ? 700 : 0)}
</script>
<span class="numctl">
  <button class="pm" aria-label="Lower" disabled={shownValue <= control.min} onclick={() => send(shownValue - step, true)}>−</button>
  {#if control.max != null && control.min != null}<input type="range" min={control.min} max={control.max} {step} value={shownValue} oninput={event => draft = Number(event.currentTarget.value)} onchange={event => send(Number(event.currentTarget.value))}>{/if}
  <span class="val">{valueText(control, shownValue)}</span>
  <button class="pm" aria-label="Raise" disabled={shownValue >= control.max} onclick={() => send(shownValue + step, true)}>+</button>
</span>
<style>
  .numctl{display:inline-flex;align-items:center;gap:6px;min-width:0}
  .numctl input{flex:1;min-width:60px;max-width:160px}
  .val{min-width:58px;text-align:center;font-size:16px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pm{width:28px;height:28px;border-radius:50%;border:1px solid var(--glass-border);background:var(--glass);font-size:16px;line-height:1;display:grid;place-items:center;flex:none}
  .pm:disabled{opacity:.35}
</style>
