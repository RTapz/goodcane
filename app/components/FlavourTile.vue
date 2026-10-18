<script setup lang="ts">
// A flavour shown as a tinted circle with a simple bottle in the flavour's accent colour.
// Drawn in SVG, never a photo (spec 6.4, constraint 6). Decorative: the name is always shown beside it.
// The tint is 6% so every accent stays at least 3:1 against its own circle (lowest: 3.03).
const props = withDefaults(defineProps<{ colour: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const sizeClass = { sm: 'size-9', md: 'size-14', lg: 'size-20' }
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-flex shrink-0 items-center justify-center rounded-full"
    :class="sizeClass[props.size]"
    :style="{ backgroundColor: `color-mix(in srgb, ${props.colour} 6%, white)` }"
  >
    <svg viewBox="0 0 24 24" class="h-3/5 w-3/5">
      <rect x="10" y="1.5" width="4" height="3" rx="1" :fill="props.colour" />
      <path d="M9.5 4.5h5v2.5c0 1 2.5 2 2.5 4.5v9.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9.5C7 9 9.5 8 9.5 7z" :fill="props.colour" />
      <rect x="8.5" y="13" width="7" height="5" rx="1" fill="#fff" fill-opacity="0.75" />
    </svg>
  </span>
</template>
