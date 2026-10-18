<script setup lang="ts">
// A flavour's bottle on a cream "studio" disc (spec 6.4), so every flavour, even the charcoal one,
// stands out on dark green. Decorative: the flavour name is always shown as text next to it.
// Fixed width and height (no layout shift); lazy unless it is above the fold (`eager`).
const props = withDefaults(defineProps<{ name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; eager?: boolean }>(), {
  size: 'md',
  eager: false
})

// Disc diameter and overall height in CSS pixels. The bottle stands slightly taller than its disc.
const sizes = {
  xs: { disc: 40, height: 46 },
  sm: { disc: 56, height: 64 },
  md: { disc: 100, height: 124 },
  lg: { disc: 150, height: 196 }
} as const
// The bottle images are 0.37 wide per 1 tall (89x240 small, 266x720 large; ASPECT in make_bottles.py).
const box = computed(() => sizes[props.size])
const bottleHeight = computed(() => Math.round(box.value.height - box.value.disc * 0.08))
const bottleWidth = computed(() => Math.round(bottleHeight.value * 0.37))
const slug = computed(() => props.name.toLowerCase().replace(/\s+/g, '-'))
</script>

<template>
  <span aria-hidden="true" class="relative inline-flex shrink-0 justify-center" :style="{ width: `${box.disc}px`, height: `${box.height}px` }">
    <span class="absolute bottom-0 left-0 rounded-full bg-studio" :style="{ width: `${box.disc}px`, height: `${box.disc}px` }" />
    <span
      class="absolute left-1/2 -translate-x-1/2"
      :style="{
        bottom: `${box.disc * 0.05}px`,
        width: `${bottleWidth * 1.4}px`,
        height: `${Math.max(4, box.disc * 0.08)}px`,
        background: 'radial-gradient(closest-side, rgb(0 0 0 / 0.28), transparent)'
      }"
    />
    <img
      :src="`/bottles/${slug}-sm.webp`"
      :srcset="`/bottles/${slug}-sm.webp 89w, /bottles/${slug}-lg.webp 266w`"
      :sizes="`${bottleWidth}px`"
      :width="bottleWidth"
      :height="bottleHeight"
      alt=""
      :loading="props.eager ? 'eager' : 'lazy'"
      decoding="async"
      class="absolute left-1/2 -translate-x-1/2"
      :style="{ bottom: `${box.disc * 0.08}px` }"
    >
  </span>
</template>
