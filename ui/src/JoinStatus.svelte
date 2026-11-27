<script>
  // One device's join, step by step, with its signal and, when it goes wrong, what went wrong and what to do
  import {live, act, toast} from "./api.svelte.js";
  let {report, compact = false} = $props();
  let snap = $derived(live.snap);
  const STEPS = [["joined", "Joined"], ["secured", "Got the key"], ["described", "Said what it is"], ["endpoints", "Listed its parts"], ["identified", "Make and model"], ["ready", "Ready"]];
  let failingAt = $derived(report.outcome === "ready" ? -1 : report.failing ? STEPS.findIndex(([step]) => step === report.failing.step) : report.outcome === "joining" ? -1 : STEPS.findIndex(([step]) => !report.done[step]));
  let current = $derived(STEPS.findIndex(([step]) => !report.done[step]));
  let rssi = $derived(report.signal?.rssi), word = $derived(rssi === undefined ? "" : rssi > -70 ? "Strong" : rssi > -82 ? "Fair" : "Weak");
  let bars = $derived(rssi === undefined ? 0 : rssi > -65 ? 4 : rssi > -75 ? 3 : rssi > -82 ? 2 : 1);
  let via = $derived(report.parent ? snap.devices.find(device => device.ieee === report.parent)?.name ?? report.parent : "the adapter");
  let trying = $state(false);
  async function again() {trying = true; try {await act("joinAgain", {ieee: report.ieee})} catch {} trying = false}
</script>
<div class="join" class:compact>
  <ol class="track">
    {#each STEPS as [step, label], index}
      <li class:done={report.done[step]} class:now={index === current && report.outcome === "joining"} class:bad={index === failingAt}><span class="dot">{report.done[step] ? "✓" : index === failingAt ? "✕" : ""}</span><span class="label">{label}</span></li>
    {/each}
  </ol>
  {#if rssi !== undefined}
    <div class="signal {word.toLowerCase()}" title="Signal of the last message heard from it"><span class="bars">{#each [1, 2, 3, 4] as bar}<i class:on={bar <= bars} style="height:{bar * 3 + 3}px"></i>{/each}</span>{word} signal to {via}: {rssi} dBm{#if report.sent.failed} · {report.sent.failed} of {report.sent.ok + report.sent.failed} messages unanswered{/if}</div>
  {/if}
  {#if report.verdict && report.outcome !== "joining"}
    <div class="verdict {report.verdict.kind === 'unknown-model' ? 'info' : 'bad'}">
      <b>{report.verdict.headline}</b>
      <span>{report.verdict.why}</span>
      <ul>{#each report.verdict.fixes as fix}<li>{fix}</li>{/each}</ul>
      {#if report.verdict.kind !== "unknown-model"}<div class="acts"><button class="pill primary" disabled={trying} onclick={again}>{trying ? "Trying…" : "Try again now"}</button>{#if report.retries}<span class="muted small">Tried {report.retries} {report.retries === 1 ? "time" : "times"} so far</span>{/if}</div>{/if}
    </div>
  {/if}
</div>
<style>
  .join{display:flex;flex-direction:column;gap:8px;font-size:13.5px}
  .track{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(6,1fr);gap:2px}
  .track li{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;position:relative;color:var(--faint)}
  .track li:not(:first-child)::before{content:"";position:absolute;top:9px;right:calc(50% + 11px);width:calc(100% - 22px);height:2px;background:var(--glass-border)}
  .track li.done:not(:first-child)::before{background:var(--green)}
  .dot{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;border:2px solid var(--glass-border);color:var(--on-tint)}
  .track li.done{color:var(--muted)}.track li.done .dot{background:var(--green);border-color:var(--green)}
  .track li.now .dot{border-color:var(--blue);animation:pulse 1.2s ease-in-out infinite}.track li.now{color:var(--text)}
  .track li.bad .dot{background:var(--red);border-color:var(--red)}.track li.bad{color:var(--red)}
  @keyframes pulse{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--blue) 30%,transparent)}}
  .label{font-size:11.5px;line-height:1.2}
  .compact .label{display:none}
  .signal{display:flex;align-items:center;gap:8px;color:var(--muted)}
  .signal.weak{color:var(--red)}.signal.fair{color:var(--amber)}
  .bars{display:inline-flex;align-items:flex-end;gap:2px}.bars i{width:4px;border-radius:1px;background:var(--glass-border)}.bars i.on{background:currentColor}
  .signal.strong .bars i.on{background:var(--green)}
  .verdict{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:12px;border:1px solid}
  .verdict.bad{border-color:color-mix(in srgb,var(--red) 45%,transparent);background:color-mix(in srgb,var(--red) 10%,transparent)}
  .verdict.info{border-color:var(--glass-border)}
  .verdict ul{margin:2px 0 0;padding-left:18px;color:var(--muted);display:flex;flex-direction:column;gap:2px}
  .acts{display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap}
  .small{font-size:12.5px}
</style>
