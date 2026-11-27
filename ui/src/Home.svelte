<script>
  import {live, act, call, toast, undo} from "./api.svelte.js";
  import {view, toggleChosen, seeHint} from "./ui.svelte.js";
  import {STATUS_COLOUR, ago, dayClock, deviceBars, holdable} from "./util.js";
  import Icon from "./Icon.svelte";
  import Pic from "./Pic.svelte";
  import MapView from "./MapView.svelte";
  import DevicePanel from "./DevicePanel.svelte";
  import JoinBox from "./JoinBox.svelte";
  import GettingRunning from "./GettingRunning.svelte";

  let snap = $derived(live.snap), notRunning = $derived(!snap.sim && !snap.radio.up);
  let devices = $derived(snap.devices);
  let checkedAt = $derived(snap.scan?.finishedAt || snap.links.ts);
  // the map check as it goes: the adapter, then each plugged-in device
  let scanRows = $derived.by(() => {
    const scan = snap.scan, rows = [{ieee: snap.stickIeee, name: "Adapter"}].concat(devices.filter(device => device.kind === "router" && device.status === "accepted").map(device => ({ieee: device.ieee, name: device.name})));
    return rows.map(row => {const answered = scan.answered.find(entry => entry.ieee === row.ieee); return Object.assign({}, row, {state: answered ? "ok" : scan.silent.includes(row.ieee) ? "silent" : scan.running && scan.asking === row.ieee ? "asking" : "waiting", hears: answered?.hears})});
  });
  let order = {bad: 0, warn: 1, waiting: 2, new: 3, ok: 4};
  let accepted = $derived(devices.filter(device => device.status === "accepted").filter(device => !view.search || (device.name + " " + (device.description ?? "") + " " + (device.model ?? "")).toLowerCase().includes(view.search.toLowerCase())).sort((first, second) => order[first.health.status] - order[second.health.status] || first.name.localeCompare(second.name)));
  let waiting = $derived(devices.filter(device => device.status === "waiting"));
  let joining = $derived(snap.join.endsAt > view.now);
  let tab = $state("map"); // phone only: Map | Devices
  let opened = $derived(devices.find(device => device.ieee === view.open));

  // rewind: hop between moments the mesh changed
  let atLinks = $state(null), ghosts = $state([]);
  $effect(() => {const at = view.at; if (at) call("topology", {ts: at}).then(result => atLinks = result.links).catch(() => {}); else atLinks = null});
  $effect(() => {const latest = snap.links; if (!latest.ts) return; call("topology", {ts: latest.ts - 1}).then(previous => {const now = new Map(latest.links.map(link => [link.child, link.parent])); ghosts = view.now - latest.ts < 864e5 ? previous.links.filter(link => now.has(link.child) && now.get(link.child) !== link.parent) : []}).catch(() => {})});
  let changes = $derived(snap.changes);
  let atIndex = $derived(view.at ? changes.indexOf(view.at) : changes.length);
  function hop(step) {const index = atIndex + step; if (index >= changes.length) {view.at = null; view.compare = false} else if (index >= 0) view.at = changes[index]}
  let mapLinks = $derived(view.at && atLinks && !view.compare ? atLinks : snap.links.links);
  let thenLinks = $derived(view.at && view.compare ? atLinks : null);
  let nearEvents = $derived(view.at ? live.events.filter(event => Math.abs(event.ts - view.at) < 3 * 3600e3).slice(0, 6) : []);

  function pick(ieee) {if (view.chosen.length) toggleChosen(ieee); else view.open = view.open === ieee ? null : ieee}
  function hold(ieee) {toggleChosen(ieee); seeHint("hold")}
  // Removing can't be undone for real (the device leaves), so it waits for the pill's doughnut before it happens
  function removeChosen() {
    const list = view.chosen.slice(), names = list.map(ieee => devices.find(device => device.ieee === ieee)?.name).join(", ");
    view.chosen = [];
    toast(`Removing ${list.length === 1 ? names : list.length + " devices"}`, null, "info", async () => {for (const ieee of list) await act("remove", {ieee}).catch(() => {})});
  }
  let groupMenu = $state(false);
  async function addToGroup(id) {groupMenu = false; const list = view.chosen.slice(); view.chosen = []; if (id === "new") await act("groupCreate", {name: "New group", members: list}); else for (const ieee of list) await act("groupMember", {id, ieee})}
  function keydown(event) {if (view.chosen.length && event.key.toLowerCase() === "d" && !event.ctrlKey && !event.metaKey && event.target.tagName !== "INPUT") removeChosen()}
</script>

<svelte:window onkeydown={keydown}/>
<div class="home">
  <div class="phonetabs tabs"><button class:on={tab === "map"} onclick={() => tab = "map"}>Map</button><button class:on={tab === "list"} onclick={() => tab = "list"}>Devices</button></div>
  {#if notRunning}<div class="runslot" class:hide={tab !== "map"}><GettingRunning/></div>{:else}
  <section class="card mapcard" class:hide={tab !== "map"}>
    <div class="maphead">
      <span class="when">{#if view.at}<b>{dayClock(view.at)}</b>{:else}<b>Network map</b>{/if}</span>
      {#if changes.length}<span class="hop">
        <button class="iconbtn small" title="Previous change" disabled={atIndex <= 0} onclick={() => hop(-1)}><Icon name="prev" small/></button>
        <button class="iconbtn small" title="Next change" disabled={!view.at} onclick={() => hop(1)}><Icon name="next" small/></button>
      </span>{/if}
      {#if view.at}<button class="chip" class:on={view.compare} onclick={() => view.compare = !view.compare}>{view.compare ? "Comparing with now" : "Compare with now"}</button><button class="chip" onclick={() => {view.at = null; view.compare = false}}>Back to now<kbd>Esc</kbd></button>{/if}
      <span class="faint checked">{snap.scan.running ? `Checking… ${snap.scan.done} of ${snap.scan.total}` : checkedAt ? `Checked ${ago(checkedAt, view.now)}` : "Not checked yet"}</span>
      <button class="chip" disabled={!snap.radio.up || snap.scan.running} onclick={() => act("rescan").then(() => toast("Map checked", null))}>Check now</button>
    </div>
    <div class="mapwrap">
      {#if !checkedAt && !view.at && devices.length}
        <div class="mapwait">
          <b>Drawing the map</b>
          <span class="muted">Each plugged-in device is asked which devices it can hear. About 5 to 20 seconds each.</span>
          <ul class="asks">
            {#each scanRows as row (row.ieee)}<li class={row.state}><span class="mark">{#if row.state === "asking"}<span class="spin"></span>{:else if row.state === "ok"}✓{:else if row.state === "silent"}✕{:else}·{/if}</span><span>{row.name}</span><span class="muted">{row.state === "ok" ? `hears ${row.hears}` : row.state === "silent" ? "didn't answer" : row.state === "asking" ? "asking…" : "waiting"}</span></li>{/each}
          </ul>
          {#if !snap.scan.running}<span class="muted">Starts in a moment.</span>{/if}
        </div>
      {:else}
      {#if checkedAt && !view.at && !snap.scan.running && !devices.some(device => device.kind === "router" && device.status === "accepted")}<div class="mapnote"><b>No plugged-in devices known yet</b><span class="muted">So there's no one to ask who talks through whom. Any on your network turn up in Waiting for you as they're heard.</span></div>{/if}
      <MapView devices={devices} links={mapLinks} stickIeee={snap.stickIeee} then={thenLinks} ghosts={view.at ? [] : ghosts} {joining} chosen={view.chosen} open={view.open} onpick={pick} onhold={hold}/>{/if}
    </div>
    {#if view.compare}<div class="legend"><span><i class="l solid"></i>New route</span><span><i class="l dashed"></i>Route that went</span></div>
    {:else}<div class="legend"><span><i style="width:13px;height:13px;border-radius:3px"></i>Plugged in, passes messages on</span><span><i style="width:13px;height:13px;border-radius:50%"></i>Battery, sleeps</span><span><i style="width:22px;height:0;border-width:2px 0 0"></i>Thicker = stronger signal</span>{#if ghosts.length && !view.at}<span><i class="l ghost"></i>Old route (last day)</span>{/if}</div>{/if}
    {#if view.at && nearEvents.length}<div class="near">{#each nearEvents as event}<div><span class="faint">{dayClock(event.ts)}</span> {event.text}</div>{/each}</div>{/if}
  </section>{/if}

  <section class="right" class:hide={tab !== "list" && !opened && !joining}>
    {#if joining}<JoinBox/>
    {:else if opened}<DevicePanel device={opened}/>
    {:else}
      {#if !view.hintsSeen.includes("hold") && accepted.length > 1}<div class="hint"><span class="t">Press and hold a device to choose several.</span><button onclick={() => seeHint("hold")}><Icon name="close" small/></button></div>{/if}
      {#if waiting.length}
        <div class="waiting card">
          <h3>Waiting for you ({waiting.length})</h3>
          {#each waiting as device (device.ieee)}
            <div class="row">
              <Pic {device}/>
              <button class="main" onclick={() => view.open = device.ieee}><div class="name">{device.name}</div><div class="sub">{device.vendor ?? ""} {device.description ?? ""}</div></button>
              <button class="pill" style="background:var(--mint)" onclick={() => act("accept", {ieee: device.ieee})}>Accept</button>
              <button class="pill ghost" onclick={() => toast(`Rejecting ${device.name}`, null, "info", () => act("reject", {ieee: device.ieee}).catch(() => {}))}>Reject</button>
            </div>
          {/each}
        </div>
      {/if}
      <div class="searchrow"><Icon name="search" small/><input id="search" class="text" placeholder="Search devices" bind:value={view.search}><kbd>/</kbd></div>
      <div class="rows">
        {#each accepted as device (device.ieee)}
          {@const handlers = holdable(() => hold(device.ieee), () => pick(device.ieee))}
          <button class="row" class:chosen={view.chosen.includes(device.ieee)} class:open={view.open === device.ieee} onpointerdown={handlers.onpointerdown} onpointermove={handlers.onpointermove} onpointerup={handlers.onpointerup} onpointerleave={handlers.onpointerleave} oncontextmenu={handlers.oncontextmenu}>
            <Pic {device}/>
            <span class="main">
              <span class="name">{device.name}{#if device.health.status !== "ok"}<span class="dot" style="background:{STATUS_COLOUR[device.health.status]}"></span>{/if}</span>
              <span class="sub">{device.health.reason ?? device.description ?? device.model ?? ""}</span>
            </span>
            <span class="meta">
              {#if device.health.battery}<span title="Battery">{device.health.battery.percent}%</span>{/if}
              <span class="bars" title={device.rssi != null ? `Signal ${device.rssi} dBm` : "Signal"}>{#each [1, 2, 3, 4] as bar}<b class:on={bar <= deviceBars(device)} style="height:{bar * 3 + 1}px"></b>{/each}</span>
              <span class="seen">{ago(device.last_seen, view.now)}</span>
            </span>
          </button>
        {/each}
        {#if !accepted.length && !waiting.length}<div class="empty"><span>No devices yet.</span><button class="pill primary" disabled={!snap.radio.up} onclick={() => act("join", {seconds: 240})}>Add devices<kbd>J</kbd></button></div>{/if}
      </div>
    {/if}
  </section>
</div>

{#if view.chosen.length}
  <div class="select-bar">
    <button class="b" onclick={() => view.chosen = []}>✕<kbd>Esc</kbd></button>
    <span class="count">{view.chosen.length} chosen</span>
    <span class="menuwrap" class:open={groupMenu}>
      <button class="b" onclick={() => groupMenu = !groupMenu}>Add to group ▸</button>
      {#if groupMenu}{#each snap.groups as group}<button class="b sub" onclick={() => addToGroup(group.id)}>{group.name}</button>{/each}<button class="b sub" onclick={() => addToGroup("new")}>+ New group</button>{/if}
    </span>
    <button class="b" onclick={removeChosen}>Remove<kbd>D</kbd></button>
  </div>
{/if}

<style>
  .home{flex:1;min-height:0;display:flex;gap:18px;padding:18px 24px 24px}
  .mapcard{flex:1;position:relative;overflow:hidden;display:flex;flex-direction:column;min-width:0}
  .maphead{display:flex;align-items:center;gap:10px;padding:12px 16px 0;flex-wrap:wrap}
  .when{font-size:15px;min-width:44px}
  .hop{display:inline-flex}
  .iconbtn.small{width:34px;height:34px}
  .iconbtn:disabled{opacity:.35}
  .checked{margin-left:auto;font-size:13px}
  .chip.on{border-color:var(--active-border);color:var(--text)}
  .mapwrap{flex:1;min-height:0;padding:6px}
  .legend{display:flex;gap:18px;color:var(--muted);font-size:12.5px;align-items:center;padding:0 18px 14px;flex-wrap:wrap}
  .legend i{display:inline-block;vertical-align:-2px;margin-right:6px;border:2px solid var(--muted)}
  .legend i.l{width:22px;height:0;border-width:2px 0 0}
  .legend i.dashed{border-style:dashed}.legend i.solid{border-color:var(--accent)}.legend i.ghost{border-style:dotted;border-color:var(--faint)}
  .near{position:absolute;left:16px;bottom:46px;max-width:60%;background:var(--sheet);border:1px solid var(--glass-border);border-radius:14px;padding:8px 12px;font-size:13px;display:flex;flex-direction:column;gap:3px;box-shadow:var(--shadow)}
  .right{width:520px;display:flex;flex-direction:column;gap:12px;min-height:0;overflow-y:auto;padding-bottom:70px}
  .waiting{padding:12px;display:flex;flex-direction:column;gap:8px;border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
  .waiting h3{font-size:14px;font-weight:500}
  .searchrow{display:flex;align-items:center;gap:8px;color:var(--muted)}
  .rows{display:flex;flex-direction:column;gap:8px}
  .row{display:flex;align-items:center;gap:14px;padding:10px 12px;background:var(--glass);border:1px solid var(--glass-border);border-radius:14px;text-align:left;width:100%;touch-action:pan-y}
  .row:hover{background:var(--glass-hover)}
  .row.open{background:var(--glass-hover)}
  .row.chosen{background:color-mix(in srgb,var(--accent) 18%,transparent);box-shadow:inset 0 0 0 1.5px var(--active-border)}
  .main{flex:1;min-width:0;display:flex;flex-direction:column;text-align:left}
  .name{font-weight:500;font-size:16px;display:flex;align-items:center;gap:8px}
  .sub{color:var(--muted);font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .meta{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px;flex:none}
  .seen{min-width:70px;text-align:right}
  .select-bar{position:fixed;left:calc(50% + 116px);bottom:var(--float-base);transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--bar);border:1px solid var(--active-border);border-radius:24px;box-shadow:var(--shadow);white-space:nowrap;z-index:25;backdrop-filter:blur(20px);max-width:calc(100vw - 24px);overflow-x:auto}
  .select-bar .b{padding:5px 12px;border-radius:18px;background:var(--glass);border:1px solid var(--glass-border);font-size:14px}
  .select-bar .count{padding:0 8px;font-size:14px}
  .menuwrap{display:inline-flex;gap:4px}.menuwrap.open{background:var(--glass);border-radius:18px}
  .b.sub{background:none}
  .phonetabs{display:none}
  @media (max-width:700px){
    .home{flex-direction:column;padding:10px 12px 0;height:auto;gap:10px}
    .phonetabs{display:flex}
    .mapcard{height:70vh;flex:none}
    .hide{display:none}
    .right{width:auto;overflow:visible;padding-bottom:20px}
    .meta .seen{display:none}
    .checked{display:none}
    .select-bar{left:50%}
  }
  .runslot{min-width:0;overflow-y:auto}.runslot :global(.running){margin:0}
  .mapwrap{position:relative}.mapnote{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:min(440px,calc(100% - 24px));display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:12px;background:var(--glass);border:1px solid var(--glass-border);font-size:13.5px;text-align:center;z-index:1}
  .mapwait{height:100%;min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:20px}
  .asks{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;min-width:min(340px,100%);text-align:left}
  .asks li{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;padding:6px 10px;border-radius:10px;background:var(--glass)}
  .asks .ok .mark{color:var(--green)}.asks .silent .mark{color:var(--red)}.asks .waiting{opacity:.6}
  .mapwait .spin{flex:none;width:14px;height:14px;border-radius:50%;border:2px solid var(--blue);border-right-color:transparent;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
