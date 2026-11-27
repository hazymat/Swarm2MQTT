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
    <div class="head"><h2>What's new</h2><span class="muted">{view.whatsNewAll ? `You have ${snap.version}` : `Updated to ${snap.version}`}</span><button class="x" onclick={close} aria-label="Close">✕<kbd>Esc</kbd></button></div>
    <ul>
      {#each entries as entry (entry.id)}
        <li class:new={entry.id > seen}><span>{entry.text}</span>{#if entry.at && canShow}<button class="link" onclick={() => showMe(entry)}>Show me ›</button>{/if}</li>
      {/each}
    </ul>
    <button class="pill primary" onclick={close}>Got it</button>
  </div>
</div>
<style>
  .scrim{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}
  .sheet{width:min(560px,100%);max-height:calc(100vh - 32px);overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;background:var(--sheet);box-shadow:var(--shadow)}
  .head{display:flex;align-items:baseline;gap:10px}
  h2{font-size:1.5rem;font-weight:300}
  .x{margin-left:auto;color:var(--muted)}
  ul{list-style:none;display:flex;flex-direction:column;gap:10px}
  li{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:14px;border:1px solid var(--glass-border)}
  li.new{border-color:var(--active-border);background:color-mix(in srgb,var(--accent) 10%,transparent)}
  .link{color:var(--accent);align-self:flex-start;font-size:14px}
  .pill{align-self:flex-end}
  @media (max-width:700px){.scrim{padding:0;align-items:stretch}.sheet{max-height:none;border-radius:0}}
</style>
