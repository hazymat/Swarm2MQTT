<script>
  // The eye button's menu: how the device list looks (Home), and light or dark everywhere. Remembered on this device.
  import {view, setList, save, LIST_DEFAULTS} from "./ui.svelte.js";
  let {onclose} = $props();
  let list = $derived(view.list), home = $derived(view.page === "home");
  const LAYOUTS = [["list", "List", "M4 6h16M4 12h16M4 18h16"], ["tiles", "Tiles", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"], ["cards", "Cards", "M4 4h16v7H4zM4 13h16v7H4z"]];
  const GROUPS = [["none", "Nothing"], ["kind", "Kind of device"], ["needs", "Needs a look first"]];
  const SORTS = [["name", "Name"], ["heard", "Last heard"], ["signal", "Weakest signal"], ["battery", "Lowest battery"]];
  const SHOW = [["battery", "Battery"], ["heard", "Last heard"], ["signal", "Signal"], ["model", "Make and model"], ["through", "Talks through"]];
  const toggleShow = key => setList({show: list.show.includes(key) ? list.show.filter(item => item !== key) : list.show.concat([key])});
  function theme(name) {view.theme = name; save("s2m-theme", name)}
  function keydown(event) {if (event.key === "Escape") {event.stopPropagation(); onclose()}}
</script>

<svelte:window onkeydown={keydown}/>
<button class="scrim" aria-label="Close" onclick={onclose}></button>
<div class="menu" role="dialog" aria-label="View">
  {#if home}
    <div><div class="mh">Layout</div>
      <div class="big seg">{#each LAYOUTS as [key, label, path]}<button class:on={list.layout === key} onclick={() => setList({layout: key})}><svg class="icon" viewBox="0 0 24 24"><path d={path}/></svg>{label}</button>{/each}</div>
    </div>
    <div><div class="mh">Detail</div>
      <div class="wide seg"><button class:on={list.detail === "compact"} onclick={() => setList({detail: "compact"})}>Compact</button><button class:on={list.detail === "expanded"} onclick={() => setList({detail: "expanded"})}>Expanded</button></div>
    </div>
    <button class="row" onclick={() => setList({glance: !list.glance})}><span>At a glance strip</span><span class="switch" class:on={list.glance}></span></button>
    <div><div class="mh">Group by</div><div class="chips">{#each GROUPS as [key, label]}<button class="chip" class:on={list.group === key} onclick={() => setList({group: key})}>{label}</button>{/each}</div></div>
    <div><div class="mh">Sort by</div><div class="chips">{#each SORTS as [key, label]}<button class="chip" class:on={list.sort === key} onclick={() => setList({sort: key})}>{label}</button>{/each}</div></div>
    <div><div class="mh">Show on each device</div><div class="chips">{#each SHOW as [key, label]}<button class="chip" class:on={list.show.includes(key)} onclick={() => toggleShow(key)}>{label}</button>{/each}</div></div>
  {/if}
  <div><div class="mh">Look</div><div class="wide seg"><button class:on={view.theme !== "light"} onclick={() => theme("glass")}>Dark</button><button class:on={view.theme === "light"} onclick={() => theme("light")}>Light</button></div></div>
  <div class="foot"><span>Remembered on this device</span>{#if home}<button class="link" disabled={JSON.stringify(list) === JSON.stringify(LIST_DEFAULTS)} onclick={() => setList(LIST_DEFAULTS)}>Reset</button>{/if}</div>
</div>

<style>
  .scrim{position:fixed;inset:0;background:rgba(5,10,20,.35);z-index:60;cursor:default}
  .menu{position:fixed;top:66px;right:16px;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 90px);overflow-y:auto;padding:14px 14px 10px;border-radius:20px;background:var(--sheet);border:1px solid var(--glass-border);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:13px;z-index:61}
  .mh{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px}
  .seg.wide,.seg.big{display:flex;border-radius:14px;padding:3px;gap:2px}
  .seg.wide button,.seg.big button{flex:1;padding:6px 4px;border-radius:11px;font-size:13.5px}
  .seg.big button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{padding:6px 11px;font-size:13.5px}
  .chip.on{background:color-mix(in srgb,var(--accent) 30%,transparent);border-color:var(--active-border);color:var(--text)}
  .row{display:flex;justify-content:space-between;align-items:center;font-size:14.5px;text-align:left}
  .foot{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--muted);border-top:1px solid var(--glass-border);padding-top:9px}
  .link{color:var(--accent);font-size:13.5px}.link:disabled{opacity:.4}
  @media (max-width:700px){.menu{right:12px;top:60px;max-height:calc(100dvh - 60px - 96px - env(safe-area-inset-bottom))}}
</style>
