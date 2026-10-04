// TEMPORARY probe — confirms a .ts module in base44/shared/ bundles into a function. Deleted after use.
export function tsProbe(x: number): number {
  const v: any = x;
  return (v as number) + 1;
}