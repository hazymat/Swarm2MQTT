<script>
  // What's new: opens by itself once after an update, and from the version in the status bar
  import {live, call} from "./api.svelte.js";
  import {view, go} from "./ui.svelte.js";
  import {WHATS_NEW, LATEST_ID} from "./whatsnew.js";
  let snap = $derived(live.snap), seen = $derived(snap?.whatsNew?.seen ?? 0);
  let entries = $derived(view.whatsNewAll ? WHATS_NEW : WHATS_NEW.filter(entry => entry.id > seen));
  function close() {view.whatsNew = false; view.whatsNewAll = false; if (seen < LATEST_ID) call("whatsNewSeen", {id: LATEST_ID}).catch(() => {})}
  function showMe(entry) {
    close(); view.wizard = false;
    if (entry.go) go(entry.go);
    setTimeout(() => {const target = document.querySelector(entry.at); if (!target) return; target.scrollIntoView({block: "center", behavior: "smooth"}); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 2400)}, 350);
  }
  let canShow = $derived(!!snap?.stickSet || !!snap?.devices.length);
</script>
<svelte:window onkeydown={event => {if (event.key === "Escape") close()}}/>
<div class="scrim" onclick={close} role="presentation">
  <div class="sheet card" onclick={event => event.stopPropagation()} role="dialog" aria-label="What's new">
    <div class="handle"></div>
    <div class="head"><h2>What's new</h2><span class="muted">{view.whatsNewAll ? snap.version : `Updated to ${snap.version}`}</span><button class="chip close" onclick={close}>✓ Close<kbd>Esc</kbd></button></div>
    <ul>
      {#each entries as entry (entry.id)}
        <li class:new={entry.id > seen}><span class="words">{entry.text}</span>{#if entry.at && canShow}<button class="pill ghost small" onclick={() => showMe(entry)}>Show me</button>{/if}</li>
      {/each}
    </ul>
  </div>
</div>
<style>
  .scrim{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}
  .sheet{width:min(620px,100%);max-height:80vh;padding:8px 16px 16px;display:flex;flex-direction:column;gap:6px;background:var(--sheet);box-shadow:var(--shadow)}
  .handle{display:none;width:44px;height:5px;border-radius:3px;background:var(--glass-border);margin:2px auto 6px}
  .head{display:flex;align-items:center;gap:10px;padding-top:8px}
  h2{font-size:1.35rem;font-weight:300}
  .close{margin-left:auto}
  ul{list-style:none;margin:0;padding:0;max-height:58vh;overflow-y:auto}
  li{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--glass-border);font-size:14.5px;line-height:1.35}
  li.new .words::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--blue);margin:0 8px 1px 0}
  .words{flex:1}
  li .pill{flex:none}
  /* phones: a sheet from the bottom, the page still showing above it */
  @media (max-width:700px){.scrim{padding:0;align-items:flex-end}.sheet{border-radius:18px 18px 0 0;max-height:75dvh;padding-bottom:calc(16px + env(safe-area-inset-bottom))}.handle{display:block}.head{padding-top:0}}
</style>
