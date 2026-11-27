<script>
  // Home while the network isn't up: a live checklist of what has to be right, each problem with its fix. Zigbee goes wrong; this is where it gets sorted.
  import {live, act, call, toast} from "./api.svelte.js";
  import {view, go} from "./ui.svelte.js";
  import {adapterState} from "./util.js";
  let {wizard = false} = $props();
  let snap = $derived(live.snap), radio = $derived(snap.radio), state = $derived(adapterState(radio));
  // Zigbee2MQTT still running is the usual culprit when moving over: watch it while this shows
  let z2m = $state(null);
  $effect(() => {
    if (!snap.mqtt.connected) return;
    let stopped = false;
    (async () => {while (!stopped) {const seen = await call("mqttProbe", {}).catch(() => null); if (stopped) break; if (seen) z2m = seen.z2m.find(item => item.running) ?? (seen.z2m.length ? {running: false} : null); await new Promise(resolve => setTimeout(resolve, 6000))}})();
    return () => {stopped = true};
  });
  let host = $derived((snap.stick?.path ?? "").match(/^tcp:\/\/([^:/]+)/)?.[1]), showLog = $state(false), retrying = $state(false);
  let seconds = $derived(radio.since ? Math.max(0, Math.round((view.now - radio.since) / 1000)) : 0), nextIn = $derived(radio.nextTry ? Math.max(0, Math.round((radio.nextTry - view.now) / 1000)) : 0);
  async function retry() {retrying = true; try {await act("adapterRetry")} catch {} retrying = false}
  const copyLog = () => navigator.clipboard?.writeText([radio.lastError ?? "", ...(radio.log ?? [])].join("\n")).then(() => toast("Copied", null));
</script>
<section class="card running" class:wizard>
  {#if !wizard}<h2>Getting your network running</h2>{/if}
  <ol class="guide">
    <li class={snap.mqtt.connected ? "done" : snap.mqtt.settings.url ? "bad" : ""}><span class="num">{snap.mqtt.connected ? "✓" : snap.mqtt.settings.url ? "✕" : "1"}</span>
      <div><b>MQTT server</b>{#if snap.mqtt.connected}<span class="muted">Connected</span>{:else if snap.mqtt.settings.url}<span class="muted">{snap.mqtt.error ?? "Not connected"}</span><button class="link" onclick={() => go("settings")}>Check it in Settings</button>{:else}<span class="muted">Not set up. Optional, but nothing else in your home sees Zigbee without it.</span>{/if}</div></li>
    {#if z2m}
      <li class={z2m.running ? "bad" : "done"}><span class="num">{z2m.running ? "✕" : "✓"}</span>
        <div><b>Zigbee2MQTT stopped</b><span class="muted">{z2m.running ? "It's still running and holding the adapter. Stop it: only one of them can use it." : "Stopped"}</span></div></li>
    {/if}
    <li class={state.kind === "up" ? "done" : state.kind === "failed" || state.kind === "none" ? "bad" : ""}><span class="num">{#if state.kind === "connecting"}<span class="spin"></span>{:else if state.kind === "up"}✓{:else}✕{/if}</span>
      <div><b>Zigbee adapter</b>
        {#if state.kind === "up"}<span class="muted">Connected: {radio.stick ?? "ready"}</span>
        {:else if state.kind === "connecting"}<span class="muted">Connecting{radio.attempts > 1 ? `, try ${radio.attempts}` : ""}… {seconds} s</span>{#if radio.lastError}<span class="muted">Last time: {radio.lastError}</span>{/if}
        {:else if state.kind === "none"}<span class="muted">No adapter set up yet.</span><button class="link" onclick={() => {view.wizard = true}}>Set it up</button>
        {:else}<span class="why">{radio.lastError ?? radio.reason}</span>
          <ul class="tries">
            <li>Stop Zigbee2MQTT, ZHA or anything else that uses the adapter.</li>
            {#if host}<li>Open <a href="http://{host}" target="_blank" rel="noreferrer">the adapter's web page</a>: nothing else should be connected. Restart it from there if it still fails.</li>
            {:else}<li>Unplug the adapter and plug it back in.</li>{/if}
            <li>Check its address and type in <button class="link inline" onclick={() => go("settings")}>Settings</button>.</li>
          </ul>
          <div class="actions"><button class="pill primary" disabled={retrying} onclick={retry}>{retrying ? "Trying…" : "Try now"}</button>{#if nextIn}<span class="muted small">Trying again by itself in {nextIn} s</span>{/if}</div>
        {/if}
      </div></li>
    <li class:done={radio.up}><span class="num">{radio.up ? "✓" : ""}</span><div><b>Network started</b><span class="muted">{radio.up ? `Running on channel ${radio.channel}. Devices check in over the next few minutes; battery ones when they next wake.` : "Shows here once the adapter is connected."}</span></div></li>
  </ol>
  {#if radio.log?.length}
    <div class="alt"><button onclick={() => showLog = !showLog}>{showLog ? "Hide" : "Show"} what the adapter said</button>{#if showLog}<button onclick={copyLog}>Copy</button>{/if}</div>
    {#if showLog}<pre class="log selectable">{radio.log.join("\n")}</pre>{/if}
  {/if}
</section>
<style>
  .running.wizard{margin:0;padding:0;background:none;border:0;box-shadow:none;backdrop-filter:none}
  .running{padding:18px;display:flex;flex-direction:column;gap:14px;margin:16px}
  h2{font-size:18px;font-weight:500}
  .guide{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px}
  .guide > li{display:grid;grid-template-columns:28px 1fr;gap:12px;align-items:start}
  .guide > li > div{display:flex;flex-direction:column;gap:6px;min-width:0}
  .num{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--glass);border:1px solid var(--glass-border);font-weight:600;font-size:14px}
  .guide > li:last-child .num{color:var(--faint)}
  .guide > li.done .num{background:var(--green);border-color:var(--green);color:var(--on-tint)}
  .guide > li.bad .num{background:var(--red);border-color:var(--red);color:var(--on-tint)}
  .why{color:var(--text)}
  .tries{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;color:var(--muted);font-size:14px}
  .tries a,.link{color:var(--accent);align-self:flex-start;font-size:14px}.link.inline{display:inline;font-size:inherit}
  .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
  .small{font-size:13px}
  .spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--blue);border-right-color:transparent;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .alt{display:flex;gap:14px;font-size:13.5px}.alt button{color:var(--accent);font-size:13.5px}
  .log{max-height:260px;overflow:auto;font-size:12px;line-height:1.5;padding:10px 12px;border-radius:10px;background:var(--well);color:var(--code);white-space:pre-wrap;word-break:break-all}
  @media (max-width:700px){.running{margin:12px}}
</style>
