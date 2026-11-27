<script>
  import {live, act, call, toast} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  import {STATUS_COLOUR, STATUS_WORD, ago, duration, dayClock, valueText} from "./util.js";
  import {weeksText} from "./weeks.js";
  import Icon from "./Icon.svelte";
  import Pic from "./Pic.svelte";
  import Spark from "./Spark.svelte";
  let {device} = $props();
  let snap = $derived(live.snap);
  let health = $derived(device.health);
  let hidden = $derived(new Set(device.hidden_controls));
  let shown = $derived(device.controls.filter(control => !hidden.has(control.property) && control.property !== "linkquality"));
  let readings = $derived(shown.filter(control => !control.setting));
  let settings = $derived(shown.filter(control => control.setting));
  let common = $derived(settings.slice(0, 3)), rest = $derived(settings.slice(3));
  let moreSettings = $state(false), moreDetails = $state(false), moreRenames = $state(false), addOpen = $state(false);
  let extra = $derived(Object.keys(device.state).filter(key => key !== "linkquality" && !device.controls.some(control => control.property === key && !hidden.has(key))));
  let nameOf = ieee => ieee === snap.stickIeee ? "Stick" : snap.devices.find(other => other.ieee === ieee)?.name ?? "?";
  // talks through: walk parents to the stick
  let chain = $derived.by(() => {const parents = new Map(snap.links.links.map(link => [link.child, link.parent])), out = [device.ieee]; let at = device.ieee; for (let step = 0; step < 8 && parents.get(at); step++) {at = parents.get(at); out.push(at)} return out});
  // 30-day history for the strip and graphs, loaded when the panel opens
  let routes = $state([]), battery = $state([]), signal = $state([]);
  $effect(() => {const ieee = device.ieee; call("linkHistory", {ieee}).then(result => routes = result).catch(() => {}); call("history", {ieee, key: "battery"}).then(result => battery = result).catch(() => {}); call("history", {ieee, key: "linkquality"}).then(result => signal = result).catch(() => {})});
  const DAYS = 30, ROUTE_TINTS = ["var(--sky)", "var(--peach)", "var(--mint)", "var(--lilac)", "var(--pink)"];
  let strip = $derived.by(() => {
    const start = view.now - DAYS * 864e5, segments = [], tints = new Map();
    routes.forEach((entry, index) => {const end = routes[index + 1]?.ts ?? view.now; if (end < start) return; if (!tints.has(entry.parent)) tints.set(entry.parent, ROUTE_TINTS[tints.size % ROUTE_TINTS.length]); segments.push({from: Math.max(start, entry.ts), to: end, parent: entry.parent, tint: tints.get(entry.parent)})});
    return {start, segments, tints};
  });
  let stripTip = $state(null);
  // editing
  let editingName = $state(false), nameDraft = $state(""), topicDraft = $state(""), editingTopic = $state(false), overrideDraft = $state("");
  async function saveName() {editingName = false; if (nameDraft.trim() && nameDraft !== device.name) await act("rename", {ieee: device.ieee, name: nameDraft}).catch(() => {})}
  async function saveTopic() {editingTopic = false; if (topicDraft.trim() && topicDraft !== device.topic) await act("topic", {ieee: device.ieee, topic: topicDraft}).catch(() => {})}
  function setValue(control, value) {act(control.setting ? "setting" : "set", control.setting ? {ieee: device.ieee, property: control.property, value} : {ieee: device.ieee, values: {[control.property]: value}}).catch(() => {})}
  let renames = $state({});
  $effect(() => {renames = Object.assign({}, device.renames)});
  let base = $derived(snap.mqtt.settings.baseTopic);
  let preview = $derived.by(() => {const renamed = {}; for (const [key, value] of Object.entries(device.state)) renamed[device.renames[key] || key] = value; return renamed});
  let bindTarget = $state("");
  let canBind = $derived(device.controls.some(control => control.property === "action"));
  let boundTo = $derived(snap.bindings.filter(binding => binding.from_ieee === device.ieee));
  let fw = $derived(device.firmwareProgress);
  async function remove() {const ieee = device.ieee, name = device.name; view.open = null; toast(`Removing ${name}`, null, "info", () => act("remove", {ieee}).catch(() => {}))}
</script>

<div class="panel card">
  <div class="top">
    <button class="chip" onclick={() => view.open = null}><Icon name="back" small/>All devices<kbd>Esc</kbd></button>
  </div>
  <div class="ptop">
    <Pic {device} size={56}/>
    <div class="title">
      {#if editingName}<input class="text big" bind:value={nameDraft} onblur={saveName} onkeydown={event => {if (event.key === "Enter") saveName(); if (event.key === "Escape") {event.stopPropagation(); editingName = false}}} autofocus>
      {:else}<button class="name" onclick={() => {nameDraft = device.name; editingName = true}} title="Rename">{device.name} <Icon name="edit" small/></button>{/if}
      <div class="muted desc">{[device.vendor, device.description].filter(Boolean).join(" · ") || device.model}</div>
    </div>
  </div>

  {#if device.status === "waiting"}
    <div class="callout info"><span class="t">It joined and is waiting for you. Nothing is sent over MQTT until you accept it.</span><button class="pill" style="background:var(--mint)" onclick={() => act("accept", {ieee: device.ieee})}>Accept</button><button class="pill ghost" onclick={() => {const ieee = device.ieee, name = device.name; view.open = null; toast(`Rejecting ${name}`, null, "info", () => act("reject", {ieee}).catch(() => {}))}}>Reject</button></div>
  {:else if health.status !== "ok" && health.reason}
    <div class="callout" class:bad={health.status === "bad"}><span class="dot" style="background:{STATUS_COLOUR[health.status]}"></span><span class="t">{health.reason}</span>
      {#if health.fix === "show-parent"}<button class="pill" style="background:var(--peach)" onclick={() => view.open = health.cutOffBy}>Show {nameOf(health.cutOffBy)}</button>
      {:else if health.fix === "replaced-battery"}<button class="pill" style="background:var(--peach)" onclick={() => act("offlineAfter", {ieee: device.ieee, ms: null}).then(() => toast("Thanks. It'll show fine again once it reports.", null))}>I've replaced it</button>{/if}
    </div>
  {:else if health.reason}<div class="callout info"><span class="t">{health.reason}</span></div>{/if}

  {#if !device.supported && device.controls.length}<div class="hint"><span class="t">We don't know this exact model, so these controls are our best guess from what it reports. Remove any that are wrong, or add others below.</span></div>{/if}

  <div class="grid2">
    <div class="box">
      <h3>Now <span class="faint">{ago(device.last_seen, view.now)}</span></h3>
      {#each readings as control (control.property)}
        <div class="kv">
          <span class="k">{control.label}{#if control.guessed}<span class="guess" title="Our best guess from what the device reports">guessed</span>{/if}</span>
          <span class="v">
            {#if control.writable && control.type === "binary"}<button class="switch" class:on={device.state[control.property] === control.on} onclick={() => setValue(control, device.state[control.property] === control.on ? control.off : control.on)} aria-label={control.label}></button>
            {:else if control.writable && control.type === "numeric" && control.max != null}<input type="range" min={control.min ?? 0} max={control.max} step={control.step ?? 1} value={device.state[control.property] ?? 0} onchange={event => setValue(control, Number(event.currentTarget.value))}>
            {:else if control.writable && control.type === "enum"}<span class="seg">{#each control.values as value}<button class:on={device.state[control.property] === value} onclick={() => setValue(control, value)}>{valueText(null, value)}</button>{/each}</span>
            {:else}<span class="reading">{valueText(control, device.state[control.property])}</span>{/if}
            <button class="x" title="Remove this control" onclick={() => act("hideControl", {ieee: device.ieee, property: control.property, hidden: true})}>✕</button>
          </span>
        </div>
      {:else}<div class="faint">{device.health.online ? "Nothing to show yet." : "Waiting for it to report."}</div>{/each}
      {#if extra.length}
        {#if addOpen}<div class="addlist">{#each extra as key}<button class="chip" onclick={() => {addOpen = false; act("addControl", {ieee: device.ieee, property: key})}}>{key.replace(/_/g, " ")}</button>{/each}</div>
        {:else}<button class="link" onclick={() => addOpen = true}>+ Add a control</button>{/if}
      {/if}
    </div>
    {#if settings.length}
      <div class="box">
        <h3>On the device</h3>
        {#each moreSettings ? settings : common as control (control.property)}
          <div class="kv"><span class="k">{control.label}</span>
            {#if control.type === "enum"}<span class="seg">{#each control.values as value}<button class:on={String(device.state[control.property]) === String(value)} onclick={() => setValue(control, value)}>{valueText(null, value)}</button>{/each}</span>
            {:else if control.type === "binary"}<button class="switch" class:on={device.state[control.property] === control.on} onclick={() => setValue(control, device.state[control.property] === control.on ? control.off : control.on)} aria-label={control.label}></button>
            {:else if control.type === "numeric"}<input class="text num" type="number" min={control.min} max={control.max} value={device.state[control.property] ?? ""} onchange={event => setValue(control, Number(event.currentTarget.value))}>
            {:else}<span>{valueText(control, device.state[control.property])}</span>{/if}
          </div>
        {/each}
        {#if rest.length}<button class="link" onclick={() => moreSettings = !moreSettings}>{moreSettings ? "Fewer" : `More (${rest.length})`}</button>{/if}
      </div>
    {/if}
  </div>

  <div class="box">
    <h3>How it connects</h3>
    <div class="chain">{#each chain as ieee, index}{#if index}<span class="arrow">→</span>{/if}<button class="hop" onclick={() => ieee !== snap.stickIeee && (view.open = ieee)}>{nameOf(ieee)}</button>{/each}{#if chain.length === 1}<span class="faint">Not seen in a map check yet</span>{/if}</div>
    <div class="striphead"><span class="faint">Last {DAYS} days</span>{#if stripTip}<span>{stripTip}</span>{/if}</div>
    <div class="strip" role="img" aria-label="Which device it talked through, over the last 30 days">
      {#each strip.segments as segment}
        <button class="seg-part" style="left:{(segment.from - strip.start) / (DAYS * 864e5) * 100}%;width:{Math.max(.6, (segment.to - segment.from) / (DAYS * 864e5) * 100)}%;background:{segment.tint}" title="Through {nameOf(segment.parent)}, from {dayClock(segment.from)}" onpointerenter={() => stripTip = `Through ${nameOf(segment.parent)} from ${dayClock(segment.from)}`} onclick={() => {view.at = snap.changes.filter(ts => ts <= segment.from + 1).pop() ?? null; view.open = null}}></button>
      {/each}
    </div>
    {#if strip.tints.size}<div class="keys">{#each Array.from(strip.tints) as [parent, tint]}<span><i style="background:{tint}"></i>{nameOf(parent)}</span>{/each}<span><i class="gap"></i>Not seen</span></div>{/if}
    <h3 style="margin-top:10px">Signal <span class="faint">{device.lqi ?? device.state.linkquality ?? "–"} of 255</span></h3>
    <Spark points={signal} min={0} max={255} height={36} label="Signal over 30 days"/>
  </div>

  <div class="grid2">
    <div class="box">
      <h3>Check-ins {#if health.checkIns.source === "learnt"}<span class="tag">learnt</span>{:else if health.checkIns.source === "override"}<span class="tag">set by you</span>{:else}<span class="tag">learning…</span>{/if}</h3>
      {#if health.checkIns.source === "fallback"}<p class="small">Learning how often it reports ({health.checkIns.samples} of 8 check-ins so far). Until then it counts as offline after {duration(health.checkIns.offlineAfterMs)} of silence.</p>
      {:else}<p class="small">{#if health.checkIns.typicalMs}Usually reports every {duration(health.checkIns.typicalMs)} (learnt from {health.checkIns.samples} check-ins).{/if} Counted offline after <b>{duration(health.checkIns.offlineAfterMs)}</b> of silence.</p>{/if}
      <Spark points={health.checkIns.recentGaps.map((gap, index) => ({ts: index, value: gap}))} bars height={34} colour="var(--sky)" label="Recent gaps between check-ins"/>
      <div class="kv"><span class="k">Offline after</span>
        {#if health.checkIns.source === "override"}<button class="link" onclick={() => act("offlineAfter", {ieee: device.ieee, ms: null})}>Learn it again</button>
        {:else}<span class="override"><input class="text num" placeholder="min" bind:value={overrideDraft}><button class="link" disabled={!Number(overrideDraft)} onclick={() => {act("offlineAfter", {ieee: device.ieee, ms: Number(overrideDraft) * 60e3}); overrideDraft = ""}}>Set</button></span>{/if}
      </div>
    </div>
    {#if health.battery}
      <div class="box">
        <h3>Battery <span class="faint">{health.battery.percent}%</span></h3>
        <p class="small">{health.battery.daysLeft !== undefined ? `About ${weeksText(health.battery.daysLeft)} left at this rate.` : "Not enough history yet to say how long it will last."}</p>
        <Spark points={battery} min={0} max={100} height={40} colour={health.battery.warn ? "var(--amber)" : "var(--green)"} label="Battery over 30 days"/>
      </div>
    {/if}
  </div>

  {#if device.status === "accepted"}
    <div class="box">
      <h3>MQTT <span class="seg">{#each [["json", "One message"], ["values", "Topic per value"], ["both", "Both"]] as [format, label]}<button class:on={device.format === format} onclick={() => act("format", {ieee: device.ieee, format})}>{label}</button>{/each}</span></h3>
      <div class="kv"><span class="k">Topic</span>
        {#if editingTopic}<input class="text" bind:value={topicDraft} onblur={saveTopic} onkeydown={event => {if (event.key === "Enter") saveTopic(); if (event.key === "Escape") {event.stopPropagation(); editingTopic = false}}} autofocus>
        {:else}<button class="topic" onclick={() => {topicDraft = device.topic; editingTopic = true}}><code>{base}/{device.topic}</code> <Icon name="edit" small/></button>{/if}
      </div>
      <div class="code"><code>{device.format !== "values" ? JSON.stringify(preview) : Object.entries(preview).map(([key, value]) => `${base}/${device.topic}/${key} → ${JSON.stringify(value)}`).join("\n")}</code></div>
      <button class="link" onclick={() => moreRenames = !moreRenames}>{moreRenames ? "Done renaming fields" : "Rename fields"}</button>
      {#if moreRenames}{#each Object.keys(device.state) as key}<div class="kv"><span class="k">{key}</span><input class="text half" placeholder={key} bind:value={renames[key]} onchange={() => act("renames", {ieee: device.ieee, renames: $state.snapshot(renames)})}></div>{/each}{/if}
    </div>
  {/if}

  {#if canBind}
    <div class="box">
      <h3>Controls directly <span class="faint">works even if this server is off</span></h3>
      {#each boundTo as binding}<div class="kv"><span>{binding.to.startsWith("group:") ? snap.groups.find(group => "group:" + group.id === binding.to)?.name : nameOf(binding.to)}</span><button class="link" onclick={() => act("bind", {from: device.ieee, to: binding.to, remove: true})}>Stop</button></div>{/each}
      <div class="kv"><select class="text" bind:value={bindTarget}><option value="">Choose a light or group…</option>{#each snap.groups as group}<option value={"group:" + group.id}>{group.name} (group)</option>{/each}{#each snap.devices.filter(other => other.ieee !== device.ieee && other.controls.some(control => control.property === "state")) as other}<option value={other.ieee}>{other.name}</option>{/each}</select><button class="pill" disabled={!bindTarget} onclick={() => {act("bind", {from: device.ieee, to: bindTarget}); bindTarget = ""}}>Connect</button></div>
    </div>
  {/if}

  <div class="box">
    <h3>Firmware <span class="faint">{device.firmware ?? "version unknown"}</span></h3>
    {#if fw}<div class="progress"><i style="width:{fw.percent}%"></i></div><p class="small">Updating… {Math.round(fw.percent)}%{fw.secondsLeft ? `, about ${duration(fw.secondsLeft * 1000)} left` : ""}. Keep it powered.</p>
    {:else if device.update_available}<div class="kv"><span><span class="dot" style="background:var(--blue)"></span> Update available</span><button class="pill primary" onclick={() => act("firmwareUpdate", {ieee: device.ieee}).catch(() => {})}>Update now</button></div>
    {:else}<button class="link" disabled={!snap.radio.up} onclick={() => act("firmwareCheck", {ieee: device.ieee}).then(available => toast(available ? "An update is available." : "It's up to date.", null)).catch(() => {})}>Check for an update</button>{/if}
  </div>

  <button class="link" onclick={() => moreDetails = !moreDetails}>{moreDetails ? "Hide details" : "Details"}</button>
  {#if moreDetails}
    <div class="box details selectable">
      <div class="kv"><span class="k">IEEE address</span><code>{device.ieee}</code></div>
      <div class="kv"><span class="k">Model</span><code>{device.model ?? "unknown"}</code></div>
      <div class="kv"><span class="k">Kind</span><span>{device.kind === "router" ? "Plugged in, passes messages on" : "Battery, sleeps"}</span></div>
      <div class="kv"><span class="k">Joined</span><span>{dayClock(device.added_at)}</span></div>
      <div class="code"><code>{JSON.stringify(device.state)}</code></div>
      <button class="pill ghost" style="margin-top:10px" onclick={remove}>Remove from the network</button>
    </div>
  {/if}
</div>

<style>
  .panel{padding:16px;display:flex;flex-direction:column;gap:12px}
  .top{display:flex}
  .ptop{display:flex;gap:14px;align-items:center}
  .title{flex:1;min-width:0}
  .name{font-size:21px;font-weight:500;display:flex;align-items:center;gap:6px;text-align:left}
  .name :global(.icon){opacity:.5}
  .text.big{font-size:19px}
  .desc{font-size:14px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .v{display:flex;align-items:center;gap:8px}
  .reading{font-size:18px;font-weight:500}
  .x{color:var(--faint);font-size:12px;padding:2px 4px;opacity:0}
  .kv:hover .x{opacity:1}
  @media (hover:none){.x{opacity:1}}
  .guess{margin-left:6px;font-size:11px;padding:1px 6px;border-radius:8px;background:color-mix(in srgb,var(--lilac) 30%,transparent)}
  .tag{font-size:11.5px;padding:1px 8px;border-radius:9px;background:var(--glass)}
  .link{color:var(--accent);font-size:14px;text-align:left;padding:4px 0;align-self:flex-start}
  .link:disabled{opacity:.4}
  .addlist{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .chain{display:flex;align-items:center;gap:7px;font-size:14px;flex-wrap:wrap}
  .hop{padding:3px 10px;border-radius:12px;background:var(--glass)}
  .arrow{color:var(--muted)}
  .striphead{display:flex;justify-content:space-between;font-size:12.5px;margin-top:10px}
  .strip{position:relative;height:14px;border-radius:7px;background:var(--glass);margin-top:4px;overflow:hidden}
  .seg-part{position:absolute;top:0;bottom:0;border-radius:3px}
  .keys{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:6px}
  .keys i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  .keys i.gap{background:var(--glass);border:1px solid var(--glass-border)}
  .small{font-size:13.5px;color:var(--muted);margin-bottom:6px}
  .small b{color:var(--text)}
  .num{width:80px}
  .half{width:55%}
  .override{display:flex;gap:6px;align-items:center}
  .topic{display:flex;gap:6px;align-items:center;text-align:left}
  .code code{white-space:pre-wrap}
  .progress{height:8px;border-radius:4px;background:var(--glass);overflow:hidden}.progress i{display:block;height:100%;background:var(--blue)}
  select.text{flex:1}
  @media (max-width:700px){.grid2{grid-template-columns:1fr}}
</style>
