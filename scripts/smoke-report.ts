// Pure helpers for scripts/smoke.ts: the final summary and the sold-out explanation.

export type StepStatus = 'pass' | 'fail' | 'skip'

export interface StepResult {
  name: string
  status: StepStatus
  /** A required step that is skipped fails the run, like a failure. */
  required: boolean
}

export interface Summary {
  passed: number
  failed: number
  skipped: number
  /** Names of required steps that were skipped. */
  requiredSkipped: string[]
  ok: boolean
  line: string
}

export function summarise(results: StepResult[]): Summary {
  const count = (status: StepStatus) => results.filter((r) => r.status === status).length
  const passed = count('pass')
  const failed = count('fail')
  const skipped = count('skip')
  const requiredSkipped = results.filter((r) => r.status === 'skip' && r.required).map((r) => r.name)
  return {
    passed,
    failed,
    skipped,
    requiredSkipped,
    ok: failed === 0 && requiredSkipped.length === 0,
    line: `${passed} passed, ${failed} failed, ${skipped} skipped (${requiredSkipped.length} required)`
  }
}

export interface SoldOutFacts {
  dropAt: string
  capacity: number
  spacesLeft: number
  /** Spaces left in the drop after it, if there is one. */
  nextDropSpaces: number | null
  /** From the owner demand view, when the passcode was available. */
  paidUnits?: number
  heldUnits?: number
}

/** Why every item is sold out, in one line, with the numbers that make up spaces left (BR-C2). */
export function soldOutMessage(facts: SoldOutFacts): string {
  const date = new Date(facts.dropAt).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Accra'
  })
  const usage =
    facts.paidUnits !== undefined && facts.heldUnits !== undefined
      ? `${facts.paidUnits} paid units, ${facts.heldUnits} units in active holds, `
      : '(set OWNER_PASSCODE to see paid units and holds), '
  const next = facts.nextDropSpaces === null ? 'no drop after it' : `next drop: ${facts.nextDropSpaces} spaces`
  return (
    `every item is sold out: drop ${date} has capacity ${facts.capacity}, ${usage}` +
    `${facts.spacesLeft} spaces left (${next}). Reseed to reset the sample drops (README, Deployment step 4).`
  )
}
