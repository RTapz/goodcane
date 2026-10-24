<script setup lang="ts">
// C0 "About this demo" (spec 6.1): what is real and what is simulated, the assumptions register
// (Appendix A) in plain words, data practices (5.8, BR-DP) and the forecast honesty rule.
import { DEMO_CUSTOMER_NAME, demoCustomerLink } from '../../server/domain/identity/demo-customer'

useHead({ title: 'About this demo | GoodCane Drops' })

// Demo mode only (BR-L4 exception): Demo Customer A's published link, rebuilt on every reseed.
const config = useRuntimeConfig()
const demoLink = computed(() => (config.public.demoMode ? demoCustomerLink(config.public.appUrl) : null))

const simulated = [
  { what: 'Payments', how: 'Simulated. You choose success, failed or no response. No money is taken and no payment provider is used.' },
  { what: 'Messages', how: 'Never sent by the app. Reminders wait in a queue; the owner opens a prefilled WhatsApp chat by hand.' },
  { what: 'Data', how: 'Made up: drinks, prices, delivery areas, customers and past orders. Anything you type here is demo data too.' },
  { what: 'Real', how: 'The ordering, reordering, private link, reminder consent and demand view all work, end to end, on a real database.' }
]

const toConfirm = [
  'How orders arrive today (WhatsApp catalogue, calls, messages) and in what share.',
  'What "Delivery on the 3rd day" means and which flavours it covers.',
  'Whether the WhatsApp catalogue is up to date.',
  'Whether bottles are frozen, and how long they keep once thawed.',
  'Which problem matters most: waste, selling out, workload or cash tied up.',
  'How many bottles can be made in a day.',
  'Shop hours, delivery areas and fees, and other pickup options.',
  'How payment is taken today.',
  'Current prices (seen publicly: 330ml 35, 500ml 45, 2L 180, 4L 260 cedis).',
  'Which flavours are always on and which are seasonal.',
  'The exact wording and evidence for product claims.',
  'Shop restocks and frozen bagged cane are business sales and out of scope.',
  'Which payment provider GoodCane would approve for a pilot with real payments.',
  'GoodCane\'s registration with the Data Protection Commission and its record keeping.'
]

const toTest = [
  'Most buyers are adults aged around 22 and over.',
  'Comments asking for location and price are orders being lost.',
  'Customer review videos drive discovery and trust.',
  '"Bought more than one" means buying again, not just a bigger order.',
  'Customers will order before a drop is made if they trust the process.',
  'Customers will opt in to reminders, and prefer WhatsApp.',
  'Finding GoodCane on TikTok and ordering on WhatsApp feel disconnected.',
  'Orders arrive in a predictable pattern before each cut-off.',
  'The owner will enter batch numbers consistently after each drop.',
  'The owner will work a short daily queue and send reminders by hand.',
  'Walk-in demand is steady enough to plan a buffer for.',
  'A rising share of pre-orders means more predictable demand, not just fewer walk-ins.'
]

const collected = [
  { data: 'First name', when: 'Always', why: 'To hand over your order and greet you' },
  { data: 'Phone number', when: 'Always', why: 'For your orders and, if you opt in, reminders' },
  { data: 'Order history', when: 'Automatic', why: 'For "Same again?" and the demand view' },
  { data: 'Reminder channel and how often', when: 'Only if you choose', why: 'To remind you before a drop' },
  { data: 'Delivery address', when: 'Delivery orders only', why: 'To deliver' },
  { data: 'Consent choices', when: 'Automatic', why: 'Proof of what you agreed to' }
]
</script>

<template>
  <div class="space-y-5 pb-8">
    <h1 class="text-2xl text-ink">About this demo</h1>
    <p class="text-ink">
      GoodCane Drops is a prototype built for a CODED paid gig. It is not GoodCane's shop and nothing here is a real order.
    </p>

    <section v-if="demoLink" class="space-y-2 rounded-2xl border-2 border-sage bg-panel-raised p-4" aria-labelledby="try-heading">
      <h2 id="try-heading" class="text-ink">Try as a returning customer</h2>
      <p class="text-ink">
        {{ DEMO_CUSTOMER_NAME }} is a made-up customer who has ordered before. Their private link opens "Same again?" in one tap.
      </p>
      <UButton :to="demoLink" external class="min-h-11" label="Open as Demo Customer A" />
      <p class="break-all font-mono text-sm text-ink-muted">{{ demoLink }}</p>
      <p class="text-sm text-ink-muted">
        Shared by everyone trying the demo. If someone uses "Delete my data now" or the owner's "Send new link" on this customer,
        the link stops working until the demo data is reset.
      </p>
    </section>

    <section class="space-y-2 gc-card p-4" aria-labelledby="real-heading">
      <h2 id="real-heading" class="text-ink">What is real and what is simulated</h2>
      <dl class="space-y-2">
        <div v-for="row in simulated" :key="row.what">
          <dt class="font-semibold text-ink">{{ row.what }}</dt>
          <dd class="text-ink-muted">{{ row.how }}</dd>
        </div>
      </dl>
    </section>

    <section class="space-y-2 gc-card p-4" aria-labelledby="assumptions-heading">
      <h2 id="assumptions-heading" class="text-ink">What we assumed</h2>
      <p class="text-ink-muted">No contact has been made with GoodCane. These are stated, not checked.</p>
      <h3 class="pt-1 font-semibold text-ink">To confirm with GoodCane before any pilot</h3>
      <ul class="list-disc space-y-1 pl-5 text-ink">
        <li v-for="item in toConfirm" :key="item">{{ item }}</li>
      </ul>
      <h3 class="pt-2 font-semibold text-ink">To test in a pilot</h3>
      <ul class="list-disc space-y-1 pl-5 text-ink">
        <li v-for="item in toTest" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="space-y-2 gc-card p-4" aria-labelledby="data-heading">
      <h2 id="data-heading" class="text-ink">Your data</h2>
      <p class="text-ink-muted">Only what is needed. No email, date of birth, precise location, advertising identifiers or trackers.</p>
      <ul class="space-y-2">
        <li v-for="row in collected" :key="row.data" class="rounded-xl bg-panel-raised p-3">
          <p class="font-semibold text-ink">{{ row.data }}</p>
          <p class="text-sm text-ink-muted">{{ row.when }}. {{ row.why }}.</p>
        </li>
      </ul>
      <p class="text-ink">
        If you place no order and change no reminder setting for 6 months, your name, phone, address and links are deleted.
        Your past orders stay in GoodCane's numbers without your name or phone.
      </p>
      <p class="text-ink">
        You can delete your details at any time from <NuxtLink to="/manage" class="font-semibold text-sage underline">Manage</NuxtLink>
        ("Delete my data now"). Your order history is only ever shown through your private link or on the phone you ordered from,
        never because someone typed a phone number.
      </p>
    </section>

    <section class="space-y-2 gc-card p-4" aria-labelledby="law-heading">
      <h2 id="law-heading" class="text-ink">Data protection</h2>
      <p class="text-ink">
        This demo was designed with the principles of Ghana's Data Protection Act, 2012 (Act 843) in mind. GoodCane, as the
        data controller, would need to confirm its registration with the Data Protection Commission and its compliance.
        This is not legal advice.
      </p>
      <ul class="list-disc space-y-1 pl-5">
        <li><a href="https://ghalii.org/akn/gh/act/2012/843" class="break-all text-sage underline" rel="noopener noreferrer" target="_blank">The Act (GhaLII)</a></li>
        <li><a href="https://dataprotection.org.gh" class="break-all text-sage underline" rel="noopener noreferrer" target="_blank">Data Protection Commission</a></li>
      </ul>
    </section>

    <section class="space-y-2 gc-card p-4" aria-labelledby="forecast-heading">
      <h2 id="forecast-heading" class="text-ink">About the forecast</h2>
      <p class="text-ink">
        The owner's demand forecast is simple arithmetic anyone can check, with no AI. In this demo it learns from made-up past
        drops, so it shows how the method works, not how accurate it would be for GoodCane. Real accuracy can only come from a pilot.
      </p>
    </section>
  </div>
</template>
