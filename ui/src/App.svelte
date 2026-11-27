<script>
  import {live, undo, redo, act} from "./api.svelte.js";
  import {view, go, save} from "./ui.svelte.js";
  import {inField} from "./util.js";
  import Icon from "./Icon.svelte";
  import Home from "./Home.svelte";
  import Groups from "./Groups.svelte";
  import Activity from "./Activity.svelte";
  import Settings from "./Settings.svelte";
  import Wizard from "./Wizard.svelte";
  import Toasts from "./Toasts.svelte";
  import JoinPill from "./JoinPill.svelte";
  import UpdateBar from "./UpdateBar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import WhatsNew from "./WhatsNew.svelte";
  import {LATEST_ID} from "./whatsnew.js";
  import {call} from "./api.svelte.js";

  const PAGES = {home: {label: "Home", icon: "home", tint: "var(--peach)"}, groups: {label: "Groups", icon: "groups", tint: "var(--mint)"}, activity: {label: "Activity", icon: "activity", tint: "var(--sky)"}, settings: {label: "Settings", icon: "settings", tint: "var(--lilac)"}};
  let snap = $derived(live.snap);
  let needsSetup = $derived(snap && !snap.stickSet && !snap.devices.length);
  $effect(() => {document.body.classList.toggle("has-select-bar", view.chosen.length > 0)});
  $effect(() => {document.body.classList.toggle("has-frame", !!snap && !needsSetup && !view.wizard)});
  // What's new: open once after an update; a new install starts with everything seen
  let whatsNewChecked = false;
  $effect(() => {if (!snap || whatsNewChecked) return; whatsNewChecked = true; const seen = snap.whatsNew?.seen; if (snap.whatsNew?.updated && (seen ?? 0) < LATEST_ID) view.whatsNew = true; else if (seen === undefined) call("whatsNewSeen", {id: LATEST_ID}).catch(() => {})});
  $effect(() => {document.documentElement.dataset.theme = view.theme === "light" ? "light" : "glass"});
  // network status chip: one colour, one sentence, opens what it's about
  let status = $derived.by(() => {
    if (!snap) return null;
    if (!live.connected) return {colour: "var(--red)", text: "Lost touch with Swarm2MQTT", sub: "trying again"};
    if (!snap.radio.up) return {colour: "var(--red)", text: snap.radio.reason ?? "Zigbee adapter not connected", sub: "", page: "settings"};
    const accepted = snap.devices.filter(device => device.status === "accepted"), bad = accepted.filter(device => device.health.status === "bad"), warn = accepted.filter(device => device.health.status === "warn");
    if (bad.length) return {colour: "var(--red)", text: bad.length === 1 ? `${bad[0].name} isn't working` : `${bad.length} not working`, sub: warn.length ? `${warn.length} need a look` : "", open: bad[0].ieee};
    if (warn.length) return {colour: "var(--amber)", text: warn.length === 1 ? `${warn[0].name} needs a look` : `${warn.length} need a look`, sub: "", open: warn[0].ieee};
    return {colour: "var(--green)", text: "All good", sub: `${accepted.length} devices`};
  });
  function statusClick() {if (status?.page) go(status.page); else if (status?.open) {go("home"); view.open = status.open}}
  function keydown(event) {
    if (event.key === "Escape") {if (view.chosen.length) {view.chosen = []; return} if (snap?.join.endsAt > view.now) {act("join", {seconds: 0}); return} if (view.open) {view.open = null; return} if (view.at) {view.at = null; view.compare = false; return}}
    if (inField(event)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {event.preventDefault(); undo()}
    if (mod && (event.key.toLowerCase() === "y" || event.key.toLowerCase() === "z" && event.shiftKey)) {event.preventDefault(); redo()}
    if (!mod && event.key.toLowerCase() === "j" && snap?.radio.up) {event.preventDefault(); go("home"); act("join", {seconds: 240})}
    if (event.key === "/") {event.preventDefault(); go("home"); document.querySelector("#search")?.focus()}
  }
  // phone bottom bar: press, hold and drag to reorder, like rows
  let dragging = $state(null), dragX = $state(0), startX = 0, holdTimer;
  function navDown(event, page) {startX = event.clientX; clearTimeout(holdTimer); holdTimer = setTimeout(() => {dragging = page; dragX = 0; navigator.vibrate?.(15)}, 400)}
  function navMove(event) {if (!dragging) {if (Math.abs(event.clientX - startX) > 10) clearTimeout(holdTimer); return} dragX = event.clientX - startX; const width = event.currentTarget.clientWidth / 4, from = view.navOrder.indexOf(dragging), to = Math.max(0, Math.min(3, from + Math.round(dragX / width))); if (to !== from) {const order = view.navOrder.filter(page => page !== dragging); order.splice(to, 0, dragging); view.navOrder = order; startX += (to - from) * width; dragX = event.clientX - startX}}
  function navUp(page) {clearTimeout(holdTimer); if (dragging) {save("s2m-nav", view.navOrder); dragging = null; return} go(page)}
</script>

<svelte:window onkeydown={keydown}/>
{#if !snap}
  <div class="empty" style="height:100vh"><img src="/icon.svg" width="48" alt=""><span>Connecting to Swarm2MQTT…</span></div>
{:else if needsSetup || view.wizard}
  <Wizard/>
  <UpdateBar/>
{:else}
  <aside id="sidebar" onpointermove={navMove} class:dragging>
    <div id="wordmark"><img src="/icon.svg" width="30" alt="">Swarm2MQTT</div>
    {#each view.navOrder as page, index (page)}
      <button class="nav-item" class:settings={page === "settings"} class:active={view.page === page || view.page === "history" && page === "activity"} class:lifted={dragging === page} style="--tint:{PAGES[page].tint};{dragging === page ? `transform:translateX(${dragX}px) rotate(-.8deg)` : ""}" onpointerdown={event => navDown(event, page)} onpointerup={() => navUp(page)} oncontextmenu={event => event.preventDefault()}><Icon name={PAGES[page].icon}/>{PAGES[page].label}</button>
    {/each}
  </aside>
  <div id="page">
    <header id="topbar">
      <h1 id="page-title"><Icon name={PAGES[view.page]?.icon ?? "home"}/>{PAGES[view.page]?.label ?? "Home"}</h1>
      {#if status}<button class="chip status" onclick={statusClick} title="Show what this is about"><span class="dot" style="background:{status.colour}"></span><b>{status.text}</b>{#if status.sub}<span class="sub">· {status.sub}</span>{/if}</button>{/if}
      {#if snap.join.endsAt > view.now}<JoinPill/>{/if}
      <button class="iconbtn" title="Light or dark" onclick={() => {view.theme = view.theme === "light" ? "glass" : "light"; save("s2m-theme", view.theme)}}><Icon name="eye"/></button>
      {#if view.page === "home" && !(snap.join.endsAt > view.now)}<button class="plus" title="Add devices (J)" disabled={!snap.radio.up} onclick={() => act("join", {seconds: 240})}><Icon name="plus"/></button>{/if}
      {#if view.page === "groups"}<button class="plus" title="New group" onclick={() => act("groupCreate", {name: "New group", members: view.chosen})}><Icon name="plus"/></button>{/if}
    </header>
    {#if snap.sim}<div class="simbar">Simulator: no real adapter. Devices and messages are made up, and time runs 60x faster.</div>{/if}
    <main class="content">
      {#if view.page === "groups"}<Groups/>
      {:else if view.page === "activity" || view.page === "history"}<Activity/>
      {:else if view.page === "settings"}<Settings/>
      {:else}<Home/>{/if}
    </main>
  </div>
  <Toasts/>
  <UpdateBar inset/>
{/if}
{#if snap}<StatusBar/>{/if}
{#if snap && view.whatsNew}<WhatsNew/>{/if}

<style>
  #sidebar{position:fixed;inset:0 auto var(--status-h) 0;width:232px;display:flex;flex-direction:column;gap:4px;padding:16px 12px;background:var(--glass);border-right:1px solid var(--glass-border);backdrop-filter:blur(20px);z-index:10}
  #wordmark{display:flex;align-items:center;gap:10px;padding:2px 8px 18px;font-weight:600;font-size:16px}
  .nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;font-weight:500;color:var(--muted);text-align:left;touch-action:none}
  .nav-item:hover{background:var(--glass)}
  .nav-item.active{background:var(--tint);color:var(--on-tint)}
  .nav-item.settings{margin-top:auto}
  .nav-item.lifted{box-shadow:0 14px 30px rgba(0,0,0,.4);z-index:2;position:relative;background:var(--sheet);color:var(--text)}
  #page{margin-left:232px;height:calc(100vh - var(--status-h));display:flex;flex-direction:column}
  #topbar{position:sticky;top:0;z-index:8;display:flex;align-items:center;gap:10px;min-height:64px;padding:10px 24px;background:var(--bar);border-bottom:1px solid var(--glass-border);backdrop-filter:blur(20px)}
  #page-title{flex:1;display:flex;align-items:center;gap:8px;font-size:1.7rem;font-weight:300;min-width:0;overflow:hidden;white-space:nowrap}
  .status{min-width:0;flex-shrink:1;overflow:hidden}
  .status b{overflow:hidden;text-overflow:ellipsis}
  .status .sub{color:var(--muted)}
  .plus:disabled{opacity:.4}
  .simbar{padding:6px 24px;font-size:13px;color:var(--muted);background:color-mix(in srgb,var(--lilac) 12%,transparent);border-bottom:1px solid var(--glass-border)}
  .content{flex:1;display:flex;flex-direction:column;min-height:0;overflow-y:auto}
  @media (max-width:700px){
    #sidebar{inset:auto 0 var(--status-h) 0;width:auto;flex-direction:row;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px 12px calc(10px + env(safe-area-inset-bottom));background:var(--bar);border-right:0;border-top:1px solid var(--glass-border)}
    #wordmark{display:none}
    .nav-item{flex-direction:column;gap:2px;padding:5px;font-size:12px;text-align:center}
    .nav-item.settings{margin-top:0}
    #page{margin-left:0;height:auto;min-height:100vh}
    #topbar{padding:10px 16px}
    #page-title{font-size:1.3rem;flex:none}
    #page-title :global(.icon){display:none}
    #topbar{gap:6px}
    .status{margin-right:auto}
    .status .sub{display:none}
    .content{padding-bottom:calc(84px + var(--status-h));overflow:visible}
  }
</style>
