// BR-FC9: the headline number on O1, "make about N units".
//
// It is the planned units we expect (the projection) plus the buffer for unplanned sales,
// rounded once at the end so small fractions are not lost along the way. It is a suggestion:
// the owner always decides how much to make.

export function suggestedProduction(projectedPlannedUnits: number, bufferUnits: number): number {
  return Math.round(projectedPlannedUnits + bufferUnits)
}
