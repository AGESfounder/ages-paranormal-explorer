// TEMPORARY deploy diagnostic — deleted after use.
export default async function (_req: Request) {
  const g: any = globalThis;
  return Response.json({
    marker: 'deploy-check-D',
    denoType: typeof g.Deno,
    denoEnvGet: typeof g.Deno?.env?.get,
    processType: typeof g.process,
  });
}