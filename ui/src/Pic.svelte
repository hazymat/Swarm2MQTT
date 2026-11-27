<script>
  // Device picture from the local cache (fetched once from zigbee2mqtt.io); a generic shape until then or if there isn't one
  import {KIND_SHAPES, shapeOf} from "./util.js";
  let {device, size = 40} = $props();
  let failed = $state(false);
</script>
<div class="pic" style="width:{size}px;height:{size}px;border-radius:{size / 3.6}px">
  {#if device.model && !failed}<img src="/picture/{encodeURIComponent(device.model)}" alt="" loading="lazy" onerror={() => failed = true}>
  {:else}<svg width={size * .55} height={size * .55} viewBox="0 0 22 22"><path d={KIND_SHAPES[shapeOf(device)]} fill="none" stroke="#334155" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
</div>
