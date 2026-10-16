// Order arithmetic shared by the server and the cart. Keep this file free of
// database, Node or Vue imports: the browser bundle imports it directly.

export interface UnitsLine {
  quantity: number
  capacityWeight: number
}

export interface PriceLine {
  quantity: number
  unitPricePesewas: number
}

function assertWholeNonNegative(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number, 0 or more (got ${value})`)
  }
}

/** Weighted units an order uses from a drop's capacity (BR-C1). */
export function orderUnits(lines: UnitsLine[]): number {
  return lines.reduce((sum, line) => {
    assertWholeNonNegative(line.quantity, 'quantity')
    assertWholeNonNegative(line.capacityWeight, 'capacityWeight')
    return sum + line.quantity * line.capacityWeight
  }, 0)
}

/** Order total in integer pesewas, including any delivery fee. */
export function orderTotalPesewas(lines: PriceLine[], feePesewas = 0): number {
  assertWholeNonNegative(feePesewas, 'feePesewas')
  return lines.reduce((sum, line) => {
    assertWholeNonNegative(line.quantity, 'quantity')
    assertWholeNonNegative(line.unitPricePesewas, 'unitPricePesewas')
    return sum + line.quantity * line.unitPricePesewas
  }, feePesewas)
}
