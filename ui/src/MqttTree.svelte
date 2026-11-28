<script>
  // What a device publishes, as an expandable tree: the one message (its JSON) and/or one topic per value, nested by topic level.
  // Values coloured by type, a value that just changed flashes, and each row can copy its topic and value.
  import {toast} from "./api.svelte.js";
  import {view, save} from "./ui.svelte.js";
  import {ago} from "./util.js";
  let {device, base, message} = $props();
  const FOLDS = "s2m-mqtt-folds", read = () => {try {return JSON.parse(localStorage.getItem(FOLDS)) ?? {}} catch {return {}}};
  let folds = $state(read()), picked = $state(null), changedAt = $state({});
  let topic = $derived(`${base}/${device.topic}`);
  // folds remembered per device; the message and topic roots start open, nested objects closed
  let find = $state("");
  const isOpen = path => !!find.trim() || (folds[device.ieee]?.[path] ?? (path === "m" || path.startsWith("t") && !path.includes(":")));
  // find: a row shows if its key or value contains the text, or something inside it does
  const hit = (key, item) => {const text = find.trim().toLowerCase(); if (!text) return true; if (String(key).toLowerCase().includes(text)) return true; if (item && typeof item === "object") return Object.entries(item).some(([inner, value]) => hit(inner, value)); return String(item).toLowerCase().includes(text)};
  function setAll(open) {const all = {m: open}, walk = (prefix, value) => {if (value && typeof value === "object") {all[prefix] = open; for (const [key, inner] of Object.entries(value)) walk(prefix + "/" + key, inner)}}; for (const [key, item] of Object.entries(message)) {walk("m/" + key, item); walk("t:/" + key, item)} levels.forEach((_, index) => all["t" + levels.slice(0, index + 1).join("/")] = open); folds[device.ieee] = all; save(FOLDS, $state.snapshot(folds))}
  // where changes go: <topic>/set with an example from the first thing that can be changed
  let example = $derived.by(() => {const control = device.controls?.find(candidate => candidate.writable && candidate.property !== "linkquality"); if (!control) return null; const key = device.renames?.[control.property] || control.property, now = device.state?.[control.property]; return JSON.stringify({[key]: control.type === "binary" ? (now === control.on ? control.off : control.on) : now ?? 0})});
  function toggle(path) {folds[device.ieee] = Object.assign({}, folds[device.ieee], {[path]: !isOpen(path)}); save(FOLDS, $state.snapshot(folds))}
  // a value that differs from the last one seen flashes for 4 s
  let previous = {}, previousDevice = null;
  $effect(() => {
    const flat = {}, walk = (prefix, value) => {if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) walk(prefix + "/" + key, inner); else flat[prefix] = JSON.stringify(value)};
    walk("", message);
    if (previousDevice === device.ieee) {const now = Date.now(), fresh = {}; for (const [path, value] of Object.entries(flat)) if (previous[path] !== undefined && previous[path] !== value) fresh[path] = now; if (Object.keys(fresh).length) changedAt = Object.assign({}, changedAt, fresh)}
    previous = flat; previousDevice = device.ieee;
  });
  const recent = path => view.now - (changedAt[path.slice(path.indexOf("/"))] ?? 0) < 4000; // "m/a/b" and "t:/a/b" both mean value /a/b
  const kind = value => value === null ? "o" : typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : typeof value === "string" ? "s" : "o";
  const shown = (value, quoted) => typeof value === "string" ? (quoted ? `"${value}"` : value) : JSON.stringify(value);
  const count = value => Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  function copy(text, what) {navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`, null)).catch(() => toast("Couldn't copy here", null, "bad"))}
  // topic levels above the device's values: base topic parts, then the device topic parts
  let levels = $derived(base.split("/").concat(device.topic.split("/")).filter(Boolean));
</script>

{#snippet value(key, item, path, depth, quoted, topicOf)}
  {@const nested = item && typeof item === "object"}
  {#if hit(key, item)}
  <div class="row" class:flash={!nested && recent(path)} class:picked={picked === path} style="padding-left:{10 + depth * 18}px">
    <button class="main" onclick={() => nested ? toggle(path) : picked = picked === path ? null : path}>
      <span class="tw">{nested ? (isOpen(path) ? "▾" : "▸") : ""}</span><span class="key">{key}</span>{#if quoted && !nested}<span class="o">:</span>{/if}
      {#if nested}<span class="o">{count(item)}</span>{:else}<span class={kind(item)}>{shown(item, quoted)}</span>{/if}
    </button>
    {#if !nested && recent(path)}<span class="when">just changed</span>{/if}
    <span class="acts">{#if topicOf}<button onclick={() => copy(topicOf, "Topic")}>Copy topic</button>{/if}<button onclick={() => copy(nested ? JSON.stringify(item) : typeof item === "string" ? item : JSON.stringify(item), "Value")}>Copy value</button></span>
  </div>
  {#if nested && isOpen(path)}{#each Object.entries(item) as [innerKey, inner]}{@render value(innerKey, inner, path + "/" + innerKey, depth + 1, quoted, topicOf)}{/each}{/if}
  {/if}
{/snippet}

<div class="tools"><input class="text find" placeholder="Find a value" bind:value={find}><button class="chip" onclick={() => setAll(true)}>Open all</button><button class="chip" onclick={() => setAll(false)}>Close all</button><button class="chip" onclick={() => copy(JSON.stringify(message, null, 2), "Message")}>Copy all</button></div>

<div class="tree">
  {#if device.format !== "values"}
    {#if device.format === "both"}<div class="sect">Message</div>{/if}
    <div class="row root message">
      <button class="main" onclick={() => toggle("m")}><span class="tw">{isOpen("m") ? "▾" : "▸"}</span><span class="name">{topic}</span><span class="o">{count(message)}</span></button>
      {#if device.last_seen}<span class="when">{ago(device.last_seen, view.now)}</span>{/if}
      <span class="acts"><button onclick={() => copy(topic, "Topic")}>Copy topic</button><button onclick={() => copy(JSON.stringify(message), "JSON")}>Copy JSON</button></span>
    </div>
    {#if isOpen("m")}{#each Object.entries(message) as [key, item]}{@render value(key, item, "m/" + key, 1, true, null)}{/each}{/if}
  {/if}
  {#if device.format !== "json"}
    {#if device.format === "both"}<div class="sect">Topics</div>{/if}
    {#each levels as level, index}
      {@const path = "t" + levels.slice(0, index + 1).join("/")}
      {#if levels.slice(0, index).every((_, upper) => isOpen("t" + levels.slice(0, upper + 1).join("/")))}
        <div class="row root" style="padding-left:{10 + index * 18}px"><button class="main" onclick={() => toggle(path)}><span class="tw">{isOpen(path) ? "▾" : "▸"}</span><span class="name">{level}</span>{#if index === levels.length - 1}<span class="o">{Object.keys(message).length} topics</span>{/if}</button></div>
      {/if}
    {/each}
    {#if levels.every((_, index) => isOpen("t" + levels.slice(0, index + 1).join("/")))}
      {#each Object.entries(message) as [key, item]}{@render value(key, item, "t:/" + key, levels.length, false, `${topic}/${key}`)}{/each}
    {/if}
  {/if}
  {#if !find.trim()}
    <div class="sect">Also under {device.topic}</div>
    <div class="row"><span class="main"><span class="tw"></span><span class="key" title="{topic}/availability">availability</span><span class="s">{device.health?.online === false ? "offline" : "online"}</span></span><span class="acts"><button onclick={() => copy(`${topic}/availability`, "Topic")}>Copy topic</button></span></div>
    {#if example}<div class="row"><span class="main"><span class="tw"></span><span class="key" title="{topic}/set">set</span><span class="o">← send</span><span class="s">{example}</span></span><span class="acts"><button onclick={() => copy(`${topic}/set`, "Topic")}>Copy topic</button><button onclick={() => copy(example, "Example")}>Copy example</button></span></div>{/if}
  {/if}
</div>

<style>
  .tree{margin-top:8px;border:1px solid var(--glass-border);border-radius:12px;padding:6px 4px;background:color-mix(in srgb,var(--bg) 45%,transparent);font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;-webkit-user-select:text;user-select:text}
  .tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}.tools .find{flex:1;min-width:140px;max-width:240px;padding:5px 10px;font-size:13.5px}.tools .chip{padding:4px 11px;font-size:13px}
  .sect{font:500 12px system-ui;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;padding:8px 10px 4px}
  .row{display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;min-height:28px}
  .row:hover,.row.picked{background:var(--glass)}
  .row.flash{background:color-mix(in srgb,var(--accent) 22%,transparent);transition:background .4s}
  .main{display:flex;align-items:baseline;gap:6px;min-width:0;text-align:left;font:inherit;flex-wrap:wrap}
  .tw{width:12px;color:var(--faint);flex:none;font-size:11px}
  .key{color:#9cc8ff}.key.long{word-break:break-all}.name{color:var(--text);font-weight:600;word-break:break-all}
  :global([data-theme=light]) .key{color:#2563eb}
  .n{color:#7ee0b8}.s{color:#ffc98a}.b{color:#d3a8ff}.o{color:var(--faint)}
  :global([data-theme=light]) .n{color:#047857}:global([data-theme=light]) .s{color:#b45309}:global([data-theme=light]) .b{color:#7c3aed}
  .n,.s,.b{word-break:break-all}
  .when{margin-left:auto;color:var(--faint);font:12px system-ui;white-space:nowrap}
  .acts{display:none;gap:4px;margin-left:auto}.row:hover .acts,.row.picked .acts{display:inline-flex}.when + .acts{margin-left:6px}
  .acts button{white-space:nowrap;font:12px system-ui;color:var(--muted);padding:2px 8px;border:1px solid var(--glass-border);border-radius:10px;background:var(--glass)}
  @media (hover:none),(max-width:700px){.row{flex-wrap:wrap}.row:hover:not(.picked) .acts{display:none}.row.picked .acts,.row.message .acts{display:inline-flex;flex-basis:100%;justify-content:flex-end;margin:4px 0 2px}}
</style>
