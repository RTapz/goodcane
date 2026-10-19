<template>
  <div class="gc-page min-h-dvh text-ink">
    <DemoDataButton />
    <header class="mx-auto w-full max-w-md px-4 py-3">
      <AppWordmark />
    </header>
    <main class="mx-auto w-full max-w-md px-4 pb-6">
      <slot />
    </main>
    <footer class="mx-auto flex w-full max-w-md flex-wrap gap-x-5 gap-y-2 px-4 pb-28 text-sm">
      <NuxtLink to="/manage" class="inline-flex min-h-11 items-center text-ink-muted underline">Manage my orders</NuxtLink>
      <NuxtLink to="/about" class="inline-flex min-h-11 items-center text-ink-muted underline">About this demo</NuxtLink>
    </footer>
  </div>
</template>
