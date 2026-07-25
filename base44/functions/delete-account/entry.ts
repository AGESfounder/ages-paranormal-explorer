import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Per App Store guideline 5.1.1(v), deleting an account must also delete the
    // data associated with it. Service role has full access, so we purge every
    // entity the user may have authored before removing the user record itself.
    // Each purge is best-effort: a failure in one collection must not stop the
    // others (or the account deletion) from completing.
    const purge = (entityName: string) =>
      base44.asServiceRole.entities[entityName]
        .deleteMany({ created_by_id: user.id })
        .catch((e) => console.error(`delete-account: purge ${entityName} failed:`, e));

    await Promise.all([
      purge('Evidence'),
      purge('StopComment'),
      purge('Report'),
      purge('Favorite'),
      purge('Investigation'),
      purge('Order'),
    ]);

    await base44.asServiceRole.entities.User.delete(user.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('delete-account failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});