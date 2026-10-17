<!-- Primary action anchored at the bottom of the screen (spec section 6). -->
<template>
  <div class="fixed inset-x-0 bottom-0 z-40 border-t border-stone-300 bg-cream-50 pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
      <slot />
    </div>
  </div>
</template>
