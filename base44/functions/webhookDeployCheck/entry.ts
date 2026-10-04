// TEMPORARY deploy diagnostic — deleted after use.
import { tsProbe } from '../../shared/tsProbe.ts';

export default async function (_req: Request) {
  return Response.json({ marker: 'deploy-check-C', tsSharedModule: tsProbe(41) });
}