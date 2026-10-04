// TEMPORARY deploy diagnostic (hyphenated name) — deleted after use.
export default async function (_req: Request) {
  const g: any = globalThis;
  return Response.json({ marker: 'hyphen-A', denoType: typeof g.Deno });
}