import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveTrustedEntitlement } from '../../shared/entitlement.js';
import { loadEnergyAccount, setAccountFields } from '../../shared/energy.js';

// Server-authoritative tool-time consumption for Observer ad-gated tools.
// The client sends a heartbeat every 5 seconds while the tool is open.
// The server uses its OWN wall clock to compute elapsed time (not the
// client's report), decrements tool_banks[tool].r, and returns the new
// remaining value. The client never writes r directly.
//
// The bank lives on the server-owned energy account (admin-write-only), so the
// remaining time cannot be edited from the client; the User record only carries a
// display mirror. The tier is resolved from the purchase ledger.
//
// Always deducts the full elapsed time — NO timeout. This means:
// - Backgrounding costs the user time (accepted trade-off)
// - A crash costs the user up to 300s (accepted trade-off)
// - Not exploitable: the user cannot preserve time by stopping heartbeats
//
// tool_banks structure: { "Tool Name": { r: remaining, e: earned_today, l: last_heartbeat_ms } }
// l = 0 means no active session (clock stopped). l > 0 means heartbeat in progress.

const AD_GATED_TOOLS = ['Audio Recorder', 'Acoustic Anomaly Sweeper'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const toolName = body?.toolName;
    const close = body?.close === true;

    if (!toolName) {
      return Response.json({ error: 'toolName is required' }, { status: 400 });
    }

    // Validate tool is ad-gated (prevent abuse — only Audio Recorder and Acoustic Anomaly Sweeper)
    if (!AD_GATED_TOOLS.includes(toolName)) {
      return Response.json({ error: 'Tool is not ad-gated' }, { status: 400 });
    }

    const entitlement = await resolveTrustedEntitlement(base44, user);
    if (entitlement.planId !== 'observer' && !entitlement.isAdmin) {
      return Response.json(
        { error: 'Ad-gated tools are only for free (Observer) users' },
        { status: 403 },
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    const account = await loadEnergyAccount(base44, user, entitlement);

    // Parse existing tool_banks (JSON string on the account)
    let banks = {};
    try {
      banks = account.tool_banks ? JSON.parse(account.tool_banks) : {};
    } catch {
      banks = {};
    }

    // Reset all counters if it's a new day
    if (account.tool_banks_date !== today) {
      banks = {};
    }

    const entry = banks[toolName] || { r: 0, e: 0, l: 0 };

    // If there's a last heartbeat, deduct elapsed time using the SERVER's wall clock.
    // No timeout — always deduct the full elapsed. This prevents the exploit where
    // a user stops heartbeats to preserve time.
    if (entry.l) {
      const elapsed = Math.floor((now - entry.l) / 1000);
      if (elapsed > 0) {
        entry.r = Math.max(0, entry.r - elapsed);
      }
    }

    // Update last heartbeat: clear on close, set to now on heartbeat
    if (close) {
      entry.l = 0;
    } else {
      entry.l = now;
    }

    banks[toolName] = entry;

    await setAccountFields(base44, account, {
      tool_banks: JSON.stringify(banks),
      tool_banks_date: today,
    });

    return Response.json({
      remaining: entry.r,
      earned: entry.e,
    });
  } catch (error) {
    console.error('consume-tool-time error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}