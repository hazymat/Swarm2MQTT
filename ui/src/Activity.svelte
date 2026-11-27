<script>
  import {live, act, call, undo, redo, toast} from "./api.svelte.js";
  import {view, go} from "./ui.svelte.js";
  import {dayClock, STATUS_COLOUR} from "./util.js";
  let snap = $derived(live.snap);
  let tab = $state(view.page === "history" ? "changes" : "log");
  let device = $state(""), technical = $state(false);
  let events = $derived(live.events.filter(event => !device || event.ieee === device));
  const LEVEL = {info: "var(--faint)", warn: STATUS_COLOUR.warn, bad: STATUS_COLOUR.bad};
  // tapping an entry rewinds the map to that moment
  function show(event) {const before = snap.changes.filter(ts => ts <= event.ts).pop(); view.at = before ?? null; if (event.ieee) view.open = event.ieee; go("home")}
  async function older() {const last = live.events[live.events.length - 1]; if (!last) return; const more = await call("events", {before: last.ts, limit: 300}).catch(() => []); live.events = live.events.concat(more)}
  function copy() {const text = events.map(event => `${new Date(event.ts).toISOString()} ${event.level.toUpperCase()} ${event.text}${event.tech ? "\n  " + event.tech : ""}`).join("\n"); navigator.clipboard?.writeText(text).then(() => toast("Copied", null))}
</script>
<div class="activity">
  <div class="tabs"><button class:on={tab === "log"} onclick={() => tab = "log"}>What happened</button><button class:on={tab === "changes"} onclick={() => tab = "changes"}>Your changes</button></div>
  {#if tab === "log"}
    <div class="filters">
      <select class="text" bind:value={device}><option value="">All devices</option>{#each snap.devices as candidate}<option value={candidate.ieee}>{candidate.name}</option>{/each}</select>
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
    <div class="list">
      {#each snap.undo as entry (entry.id)}<div class="entry" class:undone={entry.undone}><span class="when faint">{dayClock(entry.ts)}</span><span class="what">{entry.label}{#if entry.undone} <span class="faint">(undone)</span>{/if}</span></div>
      {:else}<div class="empty">Changes you make show here, newest first.</div>{/each}
    </div>
  {/if}
</div>
<style>
  .activity{padding:18px 24px 90px;display:flex;flex-direction:column;gap:14px;max-width:960px}
  .filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .filters select{width:auto}
  .chip.on{border-color:var(--active-border);color:var(--text)}
  .list{display:flex;flex-direction:column;gap:2px}
  .entry{display:flex;gap:12px;align-items:baseline;padding:8px 12px;border-radius:12px;text-align:left}
  button.entry:hover{background:var(--glass)}
  .entry.undone{opacity:.5}
  .when{flex:none;width:110px;font-size:13px}
  .what{flex:1;min-width:0}
  .tech{display:block;margin-top:4px;font-size:12px;white-space:pre-wrap}
  .more{align-self:center;margin-top:8px}
  .keep{font-size:13px}
  @media (max-width:700px){.activity{padding:12px}.when{width:70px}}
</style>
