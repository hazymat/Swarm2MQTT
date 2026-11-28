<script>
  // "Sent over MQTT": the last few messages that went out for a device, newest first, each closed like an email
  // with what changed since the one before; open one to see the changed values, the rest, or the whole message as a tree
  import {call, toast} from "./api.svelte.js";
  import {view} from "./ui.svelte.js";
  import {ago, clock} from "./util.js";
  import MqttTree from "./MqttTree.svelte";
  let {device, base} = $props();
  let sent = $state([]), open = $state(0), whole = $state(-1);
  $effect(() => {const ieee = device.ieee, _ = device.lastSent; call("sent", {ieee}).then(result => sent = result).catch(() => {})});
  $effect(() => {const _ = device.ieee; open = 0; whole = -1});
  const same = (one, other) => JSON.stringify(one) === JSON.stringify(other);
  const shown = value => typeof value === "string" ? `"${value}"` : JSON.stringify(value);
  const kind = value => value === null || typeof value === "object" ? "o" : typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s";
  // what changed from the message before it (the oldest kept has nothing to compare with)
  let entries = $derived(sent.map((message, index) => {
    const before = sent[index + 1]?.message, keys = Object.keys(message.message);
    const changed = before ? keys.filter(key => !same(message.message[key], before[key])).map(key => ({key, value: message.message[key], was: before[key]})) : [];
    const unchanged = keys.filter(key => !changed.some(item => item.key === key)).map(key => ({key, value: message.message[key]}));
    const count = keys.length, words = `${count} ${count === 1 ? "value" : "values"}`;
    let summary = !before ? "The oldest message kept here, so there's nothing to compare it with." : changed.length ? "Changed: " + changed.slice(0, 3).map(item => `${item.key} ${item.was === undefined ? "new" : shown(item.was)} → ${shown(item.value)}`).join(", ") + (changed.length > 3 ? `, and ${changed.length - 3} more` : "") : "Nothing changed: the device checked in with the same values.";
    return {message, changed, unchanged, words, summary};
  }));
  function copy(message) {navigator.clipboard?.writeText(JSON.stringify(message.message, null, 2)).then(() => toast("Copied the message", null)).catch(() => toast("Couldn't copy here. Try a newer browser.", null, "bad"))}
</script>
<div class="box sent">
  <h3>Sent over MQTT</h3>
  {#if sent.length}<p class="small">The last {sent.length === 1 ? "message" : sent.length + " messages"}, newest first. Open one to look inside.</p>{/if}
  {#if !sent.length}<p class="small">{device.health?.online ? "Nothing sent since Swarm2MQTT started. A message goes out the next time it reports." : "Nothing sent yet: it hasn't reported since Swarm2MQTT started."}</p>
  {:else}
    <ol class="timeline">
      {#each entries as entry, index (entry.message.ts)}
        <li class:latest={index === 0}>
          <div class="card">
            <button class="head" aria-expanded={open === index} onclick={() => {open = open === index ? -1 : index; whole = -1}}>
              <span class="line"><span class="tw" aria-hidden="true">{open === index ? "▾" : "▸"}</span><b>Sent {ago(entry.message.ts, view.now)}</b><span class="faint">{clock(entry.message.ts)}</span><span class="faint size">{entry.words}</span></span>
              <span class="summary">{entry.summary}</span>
              <code class="faint">{entry.message.topic}{entry.message.format === "values" ? "/…" : ""}{entry.message.format === "both" ? " and one topic per value" : ""}</code>
            </button>
            {#if open === index}
              <div class="inside">
                {#if whole === index}<MqttTree {device} {base} message={entry.message.message}/>
                {:else}
                  {#each entry.changed as item}<div class="val changed"><span class="key">{item.key}</span><span class={kind(item.value)}>{shown(item.value)}</span><span class="was">was {item.was === undefined ? "not sent" : shown(item.was)}</span></div>{/each}
                  {#each entry.unchanged.slice(0, entry.changed.length ? 3 : 6) as item}<div class="val"><span class="key">{item.key}</span><span class={kind(item.value)}>{shown(item.value)}</span></div>{/each}
                {/if}
                <div class="acts">{#if whole !== index}<button class="chip" onclick={() => whole = index}>Show all {entry.words}</button>{:else}<button class="chip" onclick={() => whole = -1}>Show what changed</button>{/if}<button class="chip" onclick={() => copy(entry.message)}>Copy message</button></div>
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
    <p class="small note">Each message carries everything Swarm2MQTT knows about the device, so only what changed is shown first. Only the last {sent.length === 1 ? "one is" : "few are"} kept, and not across restarts; the history of each value is in the graphs.</p>
  {/if}
</div>
<style>
  .timeline{list-style:none;margin:4px 0 0;padding:0 0 0 14px;border-left:2px solid var(--glass-border);display:flex;flex-direction:column;gap:8px}
  li{position:relative}
  li::before{content:"";position:absolute;left:-21px;top:15px;width:12px;height:12px;border-radius:50%;background:var(--faint);box-shadow:0 0 0 3px var(--well)}
  li.latest::before{background:var(--accent)}
  .card{border:1px solid var(--glass-border);border-radius:12px;background:var(--glass);overflow:hidden}
  .head{width:100%;display:flex;flex-direction:column;align-items:stretch;gap:3px;padding:9px 12px;text-align:left;border-radius:0}
  .head:hover{background:var(--glass-hover)}
  .line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
  .tw{width:12px;color:var(--muted)}
  .size{margin-left:auto}
  .summary{padding-left:20px;font-size:13.5px;line-height:1.4;overflow-wrap:anywhere}
  code{padding-left:20px;font-size:12px;overflow-wrap:anywhere}
  .inside{border-top:1px solid var(--glass-border);padding:6px 8px 10px;display:flex;flex-direction:column;gap:2px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px}
  .val{display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-radius:8px;opacity:.75;flex-wrap:wrap}
  .val.changed{opacity:1;background:color-mix(in srgb,var(--accent) 16%,transparent)}
  .key{color:var(--text)}
  .was{margin-left:auto;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12px;color:var(--muted)}
  .n{color:#7ee0b8}.s{color:#ffc98a}.b{color:#d3a8ff}.o{color:var(--faint)}
  :global([data-theme=light]) .sent .n{color:#047857}:global([data-theme=light]) .sent .s{color:#b45309}:global([data-theme=light]) .sent .b{color:#7c3aed}
  .n,.s,.b{word-break:break-all}
  .acts{display:flex;gap:6px;flex-wrap:wrap;padding:8px 4px 0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .note{margin:8px 0 0}
  .small{font-size:13.5px;color:var(--muted)}
</style>
