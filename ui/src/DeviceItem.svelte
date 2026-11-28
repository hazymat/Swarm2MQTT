<script>
  // One device in the list, in the layout and detail picked in the View menu. Tap opens it, press and hold chooses it; its own controls work in place.
  import {act, call} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  import {STATUS_COLOUR, ago, duration, clock, deviceBars, holdable, makeModel, valueText} from "./util.js";
  import {summaryOf, shownValue, presence, KINDS, TONE} from "./summary.js";
  import Pic from "./Pic.svelte";
  import Spark from "./Spark.svelte";
  let {device, devices, stickIeee, layout, detail, show, upstream = "", onpick, onhold} = $props();
  let summary = $derived(summaryOf(device)), expanded = $derived(detail === "expanded"), health = $derived(device.health);
  let handlers = $derived(holdable(() => onhold(device.ieee), () => onpick(device.ieee)));
  // history the picture needs: when it last saw someone, a day of temperature
  let motionPoints = $state([]), temperaturePoints = $state([]);
  let wantsTemperature = $derived(summary.kind === "climate" && (expanded || layout === "cards") && summary.room);
  $effect(() => {const stamp = device.last_seen, ieee = device.ieee; if (summary.kind === "motion") call("history", {ieee, key: summary.control.property, since: Date.now() - 864e5}).then(points => motionPoints = points).catch(() => {}); void stamp});
  $effect(() => {const stamp = device.last_seen, ieee = device.ieee, control = wantsTemperature; if (control) call("history", {ieee, key: control.property, since: Date.now() - 864e5}).then(points => temperaturePoints = points).catch(() => {}); void stamp});
  // motion: last hour in a list, today in a card; when it last saw someone
  let midnight = $derived(new Date(new Date(view.now).toDateString()).getTime());
  let motionHour = $derived(summary.kind === "motion" ? presence(motionPoints, view.now - 3600e3, view.now, 30, summary.on) : null);
  let motionDay = $derived(summary.kind === "motion" ? presence(motionPoints, midnight, view.now, 48, summary.on) : null);
  let lastOn = $derived(motionHour?.lastOn ?? null);
  let value = $derived(summary.kind === "motion" && !summary.on && lastOn ? `Nobody · ${duration(view.now - lastOn)}` : summary.value);
  let motionLine = $derived(summary.kind !== "motion" ? "" : summary.on ? (motionHour.since ? `since ${clock(motionHour.since)} · ${duration(view.now - motionHour.since)}` : "now") : lastOn ? `last movement ${ago(lastOn, view.now)}` : "no movement in the last day");
  // the line under the name: a problem first, otherwise what's picked under Show on each device
  let through = $derived(device.parent && device.parent !== stickIeee ? devices.find(other => other.ieee === device.parent)?.name : device.parent ? "the adapter" : null);
  let subParts = $derived([upstream || device.note || (show.includes("model") ? makeModel(device) : layout === "tiles" && !expanded ? KINDS[summary.kind] : ""), show.includes("through") && through ? `via ${through}` : ""].filter(Boolean));
  let percent = $derived(device.health.battery?.percent);
  let bars = $derived(deviceBars(device, stickIeee));
  // setting a target with − and +: shown at once, sent once the taps stop
  let draft = $state(null), timer;
  function step(direction) {
    const control = summary.setpoint, size = control.step ?? .5, from = draft ?? summary.target ?? 20;
    draft = Math.min(control.max ?? 35, Math.max(control.min ?? 4, Math.round((from + direction * size) / size) * size));
    clearTimeout(timer); timer = setTimeout(() => {const number = draft; act("set", {ieee: device.ieee, values: {[control.property]: number}}).catch(() => {}).finally(() => {if (draft === number) draft = null})}, 700);
  }
  let target = $derived(draft ?? summary.target);
  const toggle = control => act("set", {ieee: device.ieee, values: {[control.property]: shownValue(device, control.property) === control.on ? control.off : control.on}}).catch(() => {});
  const setMode = mode => act("set", {ieee: device.ieee, values: {system_mode: mode}}).catch(() => {});
  const stop = event => event.stopPropagation();
  const fmt = number => typeof number === "number" ? number.toFixed(1) : "–";
  // the dial and scale run over the usual room range
  const LOW = 5, HIGH = 30, place = number => Math.max(0, Math.min(1, ((number ?? LOW) - LOW) / (HIGH - LOW)));
  const knob = number => {const angle = (135 + 270 * place(number)) * Math.PI / 180; return [60 + 48 * Math.cos(angle), 60 + 48 * Math.sin(angle)]};
  let pendingOf = $derived(Object.entries(device.pending ?? {}).find(([, entry]) => entry.phase !== "set"));
  const PHASE = {sending: "Sending…", waiting: "Waiting to confirm", failed: "Didn't reach it", other: "It set something else", unconfirmed: "Not confirmed"};
</script>

{#snippet battery()}{#if show.includes("battery") && percent != null}<span class="batt" class:low={percent <= 10} title="Battery"><svg viewBox="0 0 16 10" aria-hidden="true"><rect x=".5" y=".5" width="13" height="9" rx="2" fill="none" stroke="currentColor"/><rect x="2" y="2" width={Math.max(1, 10 * percent / 100)} height="6" rx="1" fill="currentColor"/><path d="M15 3.5v3" stroke="currentColor"/></svg>{percent}%</span>{/if}{/snippet}
{#snippet signal()}{#if show.includes("signal")}<span class="bars" title="Signal">{#each [1, 2, 3, 4] as bar}<b class:on={bar <= bars} style="height:{bar * 3 + 1}px"></b>{/each}</span>{/if}{/snippet}
{#snippet heard()}{#if show.includes("heard")}<span class="when">{ago(device.last_seen, view.now)}</span>{/if}{/snippet}
{#snippet sub()}<span class="sub">{#if health.status !== "ok" && health.reason}<span style="color:{STATUS_COLOUR[health.status]}">{health.reason}</span>{:else}{subParts.join(" · ")}{/if}</span>{/snippet}
{#snippet name()}<span class="name">{device.name}{#if health.status !== "ok"}<span class="dot" style="background:{STATUS_COLOUR[health.status]}"></span>{/if}</span>{/snippet}
{#snippet pend()}{#if pendingOf}<span class="pend" class:bad={!["sending", "waiting"].includes(pendingOf[1].phase)}>{#if ["sending", "waiting"].includes(pendingOf[1].phase)}<i class="pdot"></i>{/if}{PHASE[pendingOf[1].phase] ?? ""}</span>{/if}{/snippet}
{#snippet stepper()}<span class="stepper" role="group" onpointerdown={stop} onpointerup={stop} onclick={stop}><button class="pm" aria-label="Lower" onclick={() => step(-1)}>−</button><span class="target" class:heat={summary.heating}>{fmt(target)}°</span><button class="pm" aria-label="Raise" onclick={() => step(1)}>+</button></span>{/snippet}
{#snippet onswitch()}<button class="switch" class:on={summary.on} aria-label="On or off" onpointerdown={stop} onpointerup={stop} onclick={event => {stop(event); toggle(summary.control)}}></button>{/snippet}
{#snippet motionBars(result)}<div class="mbars">{#each result.bars as on}<span class:on></span>{/each}</div>{/snippet}
{#snippet tag()}{#if summary.kind === "heating"}<span class="tag" class:heat={summary.heating}>{#if summary.heating}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 3s1-3 0-7z" fill="currentColor"/></svg>Heating{:else}{summary.off ? "Off" : "Holding"}{/if}</span>
{:else if summary.kind === "motion"}<span class="tag" class:motion={summary.on}>{#if summary.on}<i class="live"></i>{/if}{summary.on ? "Someone there" : "Nobody"}</span>{/if}{/snippet}

<div id="dev-{device.ieee}" class="item {layout} {detail}" class:chosen={view.chosen.includes(device.ieee)} class:open={view.open === device.ieee} class:warn={health.status !== "ok"} style="--status:{STATUS_COLOUR[health.status]}" role="button" tabindex="0" onkeydown={event => {if (event.key === "Enter") onpick(device.ieee)}} onpointerdown={handlers.onpointerdown} onpointermove={handlers.onpointermove} onpointerup={handlers.onpointerup} onpointerleave={handlers.onpointerleave} oncontextmenu={handlers.oncontextmenu}>
  {#if layout === "list" && !expanded}
    <Pic {device} size={38}/>
    <span class="main">{@render name()}<span class="sub">{#if health.status !== "ok" && health.reason}<span style="color:var(--status)">{health.reason}</span>{:else}{[subParts.join(" · "), show.includes("heard") ? ago(device.last_seen, view.now) : ""].filter(Boolean).join(" · ")}{/if}</span></span>
    <span class="right"><span class="val" style="color:{TONE[summary.tone]}">{value}</span><span class="meta">{@render battery()}{@render signal()}</span></span>
  {:else if layout === "list"}
    <div class="head"><Pic {device} size={36}/><span class="main">{@render name()}{@render sub()}</span><span class="meta">{@render battery()}{@render signal()}{@render heard()}</span></div>
    <div class="body">
      {#if summary.kind === "heating"}
        <div><div class="big">{fmt(summary.temperature)}<span class="unit">°C</span></div><div class="faint small">in the room</div></div>{@render tag()}<span class="push">{@render stepper()}</span>
      {:else if summary.kind === "motion"}
        {@render tag()}<span class="muted small">{motionLine}</span>
      {:else if summary.kind === "climate"}
        <div class="big">{fmt(summary.temperature)}<span class="unit">°C</span></div>{#if typeof summary.humidity === "number"}<div class="big mid" style="color:var(--sky)">{Math.round(summary.humidity)}<span class="unit">%</span></div>{/if}<span class="push spark"><Spark points={temperaturePoints} height={34} colour="var(--peach)" label="Temperature over the last day"/></span>
      {:else if summary.kind === "power" || summary.kind === "light"}
        <div class="big" style="color:{TONE[summary.tone]}">{#if summary.kind === "power" && typeof summary.watts === "number" && summary.on}{Math.round(summary.watts * 10) / 10}<span class="unit">W</span>{:else}{value}{/if}</div><span class="push">{@render onswitch()}</span>
      {:else}<div class="big mid" style="color:{TONE[summary.tone]}">{value}</div>{/if}
    </div>
    {#if summary.kind === "motion"}<div>{@render motionBars(motionHour)}<div class="axis"><span>last hour</span><span>now</span></div></div>{/if}
    {@render pend()}
  {:else if layout === "tiles" && !expanded}
    <div class="tophead"><Pic {device} size={36}/>{@render signal()}</div>
    <div class="main">{@render name()}{@render sub()}</div>
    <div class="val" style="color:{TONE[summary.tone]}">{value}</div>
    <div class="foot">{@render heard()}{@render battery()}</div>
  {:else if layout === "tiles"}
    {@render name()}
    <div class="visual">
      {#if summary.kind === "heating"}
        {@const point = knob(target)}
        <svg width="118" height="118" viewBox="0 0 120 120" role="img" aria-label="Room {fmt(summary.temperature)} degrees, {summary.word}"><circle cx="60" cy="60" r="48" fill="none" stroke="var(--glass-hover)" stroke-width="9" stroke-dasharray="226 302" stroke-linecap="round" transform="rotate(135 60 60)"/><circle cx="60" cy="60" r="48" fill="none" stroke={summary.heating ? "var(--peach)" : "var(--sky)"} stroke-width="9" stroke-dasharray="{226 * place(summary.temperature)} 302" stroke-linecap="round" transform="rotate(135 60 60)"/><circle cx={point[0]} cy={point[1]} r="6" fill="var(--text)"/></svg>
        <div class="centre"><div class="big">{fmt(summary.temperature)}<span class="unit">°</span></div><div class="small" style="color:{TONE[summary.tone]}">{summary.word.toLowerCase()}</div></div>
      {:else if summary.kind === "motion"}
        <svg width="104" height="104" viewBox="0 0 110 110" aria-hidden="true">{#if summary.on}<circle cx="55" cy="55" r="50" fill="color-mix(in srgb,var(--mint) 10%,transparent)"/><circle cx="55" cy="55" r="36" fill="color-mix(in srgb,var(--mint) 16%,transparent)"/><circle cx="55" cy="55" r="22" fill="color-mix(in srgb,var(--mint) 32%,transparent)"/>{:else}<circle cx="55" cy="55" r="36" fill="none" stroke="var(--glass-hover)" stroke-width="2" stroke-dasharray="4 6"/>{/if}<circle cx="55" cy="47" r="6" fill={summary.on ? "var(--mint)" : "var(--faint)"}/><path d="M45 70c0-7 4-12 10-12s10 5 10 12" fill={summary.on ? "var(--mint)" : "var(--faint)"}/></svg>
      {:else if summary.kind === "climate"}
        <svg width="26" height="96" viewBox="0 0 26 96" role="img" aria-label="Thermometer at {fmt(summary.temperature)} degrees"><rect x="8" y="4" width="10" height="72" rx="5" fill="var(--glass-hover)"/><rect x="8" y={4 + 72 * (1 - place(summary.temperature))} width="10" height={72 * place(summary.temperature)} rx="5" fill="var(--peach)"/><circle cx="13" cy="80" r="11" fill="var(--peach)"/></svg>
        <div><div class="big">{fmt(summary.temperature)}<span class="unit">°C</span></div>{#if typeof summary.humidity === "number"}<div class="drop"><svg width="12" height="15" viewBox="0 0 13 16" aria-hidden="true"><path d="M6.5 1C4 5 1 7.5 1 10.5a5.5 5.5 0 0 0 11 0C12 7.5 9 5 6.5 1z" fill="var(--sky)"/></svg>{Math.round(summary.humidity)}%</div>{/if}</div>
      {:else if summary.kind === "power" && typeof summary.watts === "number" && summary.on}
        <div class="big huge">{Math.round(summary.watts * 10) / 10}<span class="unit">W</span></div>
      {:else}<div class="big mid" style="color:{TONE[summary.tone]}">{value}</div>{/if}
    </div>
    {#if summary.kind === "motion"}<div class="state" style="color:{TONE[summary.tone]}">{value}</div>{/if}
    <div class="foot">{#if summary.kind === "power" || summary.kind === "light"}{@render heard()}{@render onswitch()}{:else}{@render battery()}{@render heard()}{/if}</div>
  {:else}
    <div class="head">{@render name()}<span class="meta">{@render battery()}{@render signal()}{@render heard()}</span></div>
    {#if health.status !== "ok" || subParts.length}{@render sub()}{/if}
    {#if summary.kind === "heating"}
      <div class="body"><div class="big xl">{fmt(summary.temperature)}<span class="unit">°C</span></div>
        <div class="scalewrap"><div class="scale"><span class="tick" style="left:{place(summary.temperature) * 100}%"></span><span class="knob" style="left:{place(target) * 100}%"></span></div><div class="axis"><span>room {fmt(summary.temperature)}°</span><span style="color:{TONE[summary.tone]}">{summary.word.toLowerCase()}</span></div></div>
      </div>
      <div class="body">{@render stepper()}{#if summary.mode}<span class="seg push" role="group" onpointerdown={stop} onpointerup={stop} onclick={stop}>{#each summary.mode.values as mode}<button class:on={shownValue(device, "system_mode") === mode} onclick={() => setMode(mode)}>{valueText(null, mode)}</button>{/each}</span>{/if}</div>
    {:else if summary.kind === "motion"}
      <div class="body">{@render tag()}<span class="muted small">{motionLine}</span></div>
      {#if expanded}<div>{@render motionBars(motionDay)}<div class="axis"><span>today 00:00</span><span>now</span></div></div>{/if}
    {:else if summary.kind === "climate"}
      <div class="body"><div class="big xl">{fmt(summary.temperature)}<span class="unit">°C</span></div>{#if typeof summary.humidity === "number"}<div class="big" style="color:var(--sky)">{Math.round(summary.humidity)}<span class="unit">%</span></div>{/if}</div>
      {#if expanded}<div><Spark points={temperaturePoints} height={40} colour="var(--peach)" label="Temperature over the last day"/><div class="axis"><span>last day</span><span>now</span></div></div>{/if}
    {:else if summary.kind === "power" || summary.kind === "light"}
      <div class="body"><div class="big xl" style="color:{TONE[summary.tone]}">{#if summary.kind === "power" && typeof summary.watts === "number" && summary.on}{Math.round(summary.watts * 10) / 10}<span class="unit">W</span>{:else}{value}{/if}</div><span class="push">{@render onswitch()}</span></div>
    {:else}<div class="body"><div class="big" style="color:{TONE[summary.tone]}">{value}</div></div>{/if}
    {@render pend()}
  {/if}
</div>

<style>
  .item{background:var(--glass);border:1px solid var(--glass-border);text-align:left;width:100%;min-width:0;touch-action:pan-y;cursor:pointer;outline-offset:2px}
  .item:hover,.item.open{background:var(--glass-hover)}
  .item.chosen{background:color-mix(in srgb,var(--accent) 18%,transparent);box-shadow:inset 0 0 0 1.5px var(--active-border)}
  .item:global(.flash){animation:flash 1.2s ease-out}@keyframes flash{0%{box-shadow:0 0 0 3px var(--active-border)}100%{box-shadow:0 0 0 0 transparent}}
  .name{font-weight:500;font-size:15.5px;display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sub{color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .meta{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12.5px;flex:none}
  .when{color:var(--muted);font-size:12.5px;white-space:nowrap}
  .batt{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}.batt svg{width:16px;height:10px}.batt.low{color:var(--amber)}
  .bars{display:inline-flex;align-items:flex-end;gap:2px;height:14px}.bars b{width:3px;border-radius:1px;background:var(--faint);opacity:.5}.bars b.on{background:var(--text);opacity:.85}
  .big{font-size:30px;font-weight:300;letter-spacing:-.02em;line-height:1;white-space:nowrap}
  .big.mid{font-size:22px}.big.xl{font-size:34px}.big.huge{font-size:34px}
  .unit{font-size:15px;color:var(--muted);margin-left:2px}
  .small{font-size:12.5px}
  .push{margin-left:auto}
  .tag{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:13px;background:var(--glass);color:var(--muted);white-space:nowrap}
  .tag svg{width:13px;height:13px}
  .tag.heat{background:color-mix(in srgb,var(--peach) 22%,transparent);color:var(--peach)}
  .tag.motion{background:color-mix(in srgb,var(--mint) 22%,transparent);color:var(--mint)}
  .live{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px color-mix(in srgb,var(--green) 25%,transparent)}
  .stepper{display:inline-flex;align-items:center;gap:8px;cursor:default}
  .pm{width:34px;height:34px;border-radius:50%;border:1px solid var(--glass-border);background:var(--glass);font-size:19px;display:grid;place-items:center}
  .target{font-size:17px;font-weight:500;min-width:52px;text-align:center}.target.heat{color:var(--peach)}
  .mbars{display:flex;gap:2px;align-items:flex-end;height:16px}.mbars span{flex:1;height:4px;border-radius:2px;background:var(--glass-hover)}.mbars span.on{height:16px;background:var(--green)}
  .axis{display:flex;justify-content:space-between;color:var(--faint);font-size:12px;margin-top:4px;gap:8px}
  .spark{width:120px}
  .pend{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)}.pend.bad{color:var(--amber)}
  .pdot{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{50%{opacity:.25}}
  /* list, compact */
  .list.compact{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:14px}
  .list.compact .right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;max-width:48%}
  .val{font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  /* list, expanded and cards */
  .list.expanded,.cards{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:16px}
  .head{display:flex;align-items:center;gap:12px;min-width:0}
  .body{display:flex;align-items:center;gap:12px;min-width:0;flex-wrap:wrap}
  .cards{padding:14px;border-radius:18px}
  .cards .head .name{flex:1}
  .cards.warn,.tiles.warn{border-color:color-mix(in srgb,var(--status) 55%,transparent)}
  .scalewrap{flex:1;min-width:150px}
  .scale{position:relative;height:8px;border-radius:4px;background:linear-gradient(90deg,var(--sky),var(--peach),var(--red))}
  .tick{position:absolute;top:-4px;width:3px;height:16px;margin-left:-1.5px;border-radius:2px;background:var(--text)}
  .knob{position:absolute;top:-6px;width:12px;height:12px;margin-left:-6px;border-radius:50%;border:2px solid var(--text);background:var(--sheet)}
  /* tiles */
  .tiles{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:16px;min-height:120px}
  .tiles.expanded{height:206px;gap:4px}
  .tophead{display:flex;justify-content:space-between;align-items:flex-start}
  .tiles .val{font-size:17px;margin-top:auto}
  .tiles .foot{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:auto}
  .tiles.expanded .foot{margin-top:0}
  .visual{flex:1;display:flex;align-items:center;justify-content:center;gap:14px;position:relative;min-height:0}
  .centre{position:absolute;text-align:center}
  .drop{display:flex;align-items:center;gap:5px;margin-top:8px;color:var(--sky);font-size:17px}
  .state{text-align:center;font-size:14px;font-weight:500}
</style>
