<template>
  <div class="min-h-dvh bg-cream-100 text-stone-900">
    <DemoBanner />
    <header class="mx-auto w-full max-w-md px-4 py-3">
      <AppWordmark />
    </header>
    <main class="mx-auto w-full max-w-md px-4 pb-24">
      <slot />
    </main>
  </div>
</template>
