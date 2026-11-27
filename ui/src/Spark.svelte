<script>
  // Small line chart: points [{ts, value}], optional bars for gaps
  let {points = [], height = 48, colour = "var(--accent)", bars = false, min = null, max = null, label = ""} = $props();
  let shape = $derived.by(() => {
    if (!points.length) return null;
    const values = points.map(point => point.value), low = min ?? Math.min.apply(null, values), high = max ?? Math.max.apply(null, values), span = high - low || 1;
    const first = points[0].ts, last = points[points.length - 1].ts, width = last - first || 1;
    const xy = points.map((point, index) => [bars ? index / Math.max(1, points.length - 1) * 100 : (point.ts - first) / width * 100, height - 4 - (point.value - low) / span * (height - 8)]);
    return {path: xy.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(""), xy, low, high};
  });
</script>
{#if shape}
  <svg class="spark" viewBox="0 0 100 {height}" preserveAspectRatio="none" style="height:{height}px" aria-label={label}>
    {#if bars}{#each shape.xy as [x, y]}<line x1={x} x2={x} y1={height} y2={y} stroke={colour} stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>{/each}
    {:else}<path d={shape.path} fill="none" stroke={colour} stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>{/if}
  </svg>
{:else}<div class="faint" style="font-size:13px">No history yet</div>{/if}
<style>.spark{width:100%;display:block}</style>
