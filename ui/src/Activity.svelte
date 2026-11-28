<script>
  import {live, act, call, undo, redo, toast} from "./api.svelte.js";
  import {view, go} from "./ui.svelte.js";
  import {dayClock, STATUS_COLOUR} from "./util.js";
  let snap = $derived(live.snap);
  let tab = $state(view.page === "history" ? "changes" : "log");
  $effect(() => {if (view.page === "history") tab = "changes"});
  // stepping through undo history: an entry that's done can be stepped back to (it and everything after are undone); an undone one can be stepped forward to
  let here = $derived(snap.undo.find(entry => !entry.undone)?.id ?? 0);
  function stepTo(entry) {act("undoTo", {id: entry.id}).then(result => toast(result.steps ? `${result.mode === "undo" ? "Undid" : "Redid"} ${result.steps} change${result.steps === 1 ? "" : "s"}` : "Already there", null)).catch(() => {})}
  // filters pick several at once: System (the service, adapter, MQTT, joining) and any devices, plus Problems only; nothing picked = everything
  let picked = $state(new Set()), problems = $state(false), technical = $state(false);
  const pick = key => {const next = new Set(picked); if (!next.delete(key)) next.add(key); picked = next};
  let events = $derived(live.events.filter(event => (!picked.size || picked.has(event.ieee ?? "system")) && (!problems || event.level !== "info")));
  let logged = $derived(snap.devices.filter(candidate => live.events.some(event => event.ieee === candidate.ieee) || picked.has(candidate.ieee)));
  const LEVEL = {info: "var(--faint)", warn: STATUS_COLOUR.warn, bad: STATUS_COLOUR.bad};
  // tapping an entry rewinds the map to that moment
  function show(event) {const before = snap.changes.filter(ts => ts <= event.ts).pop(); view.at = before ?? null; if (event.ieee) view.open = event.ieee; go("home")}
  async function older() {const last = live.events[live.events.length - 1]; if (!last) return; const more = await call("events", {before: last.ts, limit: 300}).catch(() => []); live.events = live.events.concat(more)}
  function copy() {const text = events.map(event => `${new Date(event.ts).toISOString()} ${event.level.toUpperCase()} ${event.text}${event.tech ? "\n  " + event.tech : ""}`).join("\n"); navigator.clipboard?.writeText(text).then(() => toast("Copied", null))}
</script>
<div class="activity">
  <div class="tabs"><button class:on={tab === "log"} onclick={() => tab = "log"}>What happened</button><button class:on={tab === "changes"} onclick={() => tab = "changes"}>Undo history</button></div>
  {#if tab === "log"}
    <div class="filters">
      <button class="chip" class:on={!picked.size} onclick={() => picked = new Set()}>Everything</button>
      <button class="chip" class:on={picked.has("system")} onclick={() => pick("system")}>System</button>
      {#each logged as candidate (candidate.ieee)}<button class="chip" class:on={picked.has(candidate.ieee)} onclick={() => pick(candidate.ieee)}>{candidate.name}</button>{/each}
      <span class="gap"></span>
      <button class="chip" class:on={problems} onclick={() => problems = !problems}>Problems only</button>
      <button class="chip" class:on={technical} onclick={() => technical = !technical}>Technical log</button>
      {#if technical}<button class="chip" onclick={copy}>Copy</button>{/if}
    </div>
    <div class="list">
      {#each events as event (event.id)}
        <button class="entry" onclick={() => show(event)} title="Show the map at this moment">
          <span class="dot" style="background:{LEVEL[event.level]}"></span>
          <span class="when faint">{dayClock(event.ts)}</span>
          <span class="what">{event.text}{#if technical && event.tech}<code class="tech">{event.tech}</code>{/if}</span>
        </button>
      {:else}<div class="empty">Nothing has happened yet.</div>{/each}
      {#if live.events.length >= 300}<button class="chip more" onclick={older}>Older</button>{/if}
    </div>
    <p class="faint keep">Kept for 30 days, like all history.</p>
  {:else}
    <div class="filters"><button class="chip" onclick={undo}>Undo<kbd>Ctrl Z</kbd></button><button class="chip" onclick={redo}>Redo<kbd>Ctrl Y</kbd></button></div>
    <div class="list timeline">
      {#each snap.undo as entry (entry.id)}
        {#if entry.id === here && snap.undo.some(other => other.undone)}<div class="here">You are here</div>{/if}
        <button class="entry step" class:undone={entry.undone} onclick={() => stepTo(entry)} title={entry.undone ? "Redo up to here" : "Undo back to before this"}><span class="when faint">{dayClock(entry.ts)}</span><span class="what">{entry.label}{#if entry.detail || (entry.hand && !entry.undone)}<span class="sub">{entry.detail ?? ""}{#if entry.hand && !entry.undone}{entry.detail ? " · " : ""}undoing it needs you to press the device's button{/if}</span>{/if}</span><span class="act faint">{entry.undone ? "Redo to here" : "Undo to here"}</span></button>
      {:else}<div class="empty">Changes you make show here, newest first.</div>{/each}
      {#if snap.undo.length && !here}<div class="here">You are here: everything above is undone</div>{/if}
    </div>
    <p class="faint keep">Kept for 30 days.</p>
  {/if}
</div>
<style>
  .activity{padding:18px 24px 90px;display:flex;flex-direction:column;gap:14px;max-width:960px}
  .filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .filters select{width:auto}.filters .gap{flex:1}
  .chip.on{border-color:var(--active-border);color:var(--text)}
  .list{display:flex;flex-direction:column;gap:2px}
  .entry{display:flex;gap:12px;align-items:baseline;padding:8px 12px;border-radius:12px;text-align:left}
  button.entry:hover{background:var(--glass)}
  .entry.undone{opacity:.5}
  .step .act{font-size:12.5px;opacity:0}.step:hover .act,.step:focus-visible .act{opacity:1}
  .here{font-size:12.5px;color:var(--accent);padding:4px 12px;border-top:2px solid var(--accent);margin:2px 0}
  .small{font-size:13px}
  .when{flex:none;width:110px;font-size:13px}
  .what{flex:1;min-width:0}
  .sub{display:block;font-size:13px;color:var(--faint);margin-top:1px;overflow-wrap:anywhere}
  .tech{display:block;margin-top:4px;font-size:12px;white-space:pre-wrap}
  .more{align-self:center;margin-top:8px}
  .keep{font-size:13px}
  @media (max-width:700px){.activity{padding:12px}.when{width:70px}.step .act{opacity:1}}
</style>
