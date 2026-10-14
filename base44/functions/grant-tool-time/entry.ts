import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveTrustedEntitlement } from '../../shared/entitlement.js';
import { loadEnergyAccount, setAccountFields } from '../../shared/energy.js';

// Grants 30 seconds of tool use time to an Observer user after they watch a
// rewarded ad.
//
// The tool-time bank lives on the server-owned energy account (admin-write-only),
// not on the User record: a record's custom fields are writable by their own
// owner, so a bank kept there could simply be edited to unlimited time. The user
// record keeps a display mirror for the UI.
//
// Daily cap: 300s (5 min) per tool per day — 10 ad watches max.
// Only Observer (free) users need ad-gated tool time; Seeker+ is ad-free. The
// tier is resolved from the purchase ledger, so a forged plan cannot buy ad-free
// tool time and a real subscriber is never pushed into the ad gate.
// The tool_banks structure: { "Tool Name": { r: remaining, e: earned_today } }
// Resets daily via tool_banks_date comparison.

const TOOL_AD_DURATION = 30;
const TOOL_DAILY_CAP = 300;
const AD_GATED_TOOLS = ['Audio Recorder', 'Acoustic Anomaly Sweeper'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const toolName = body?.toolName;
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

    const entry = banks[toolName] || { r: 0, e: 0 };

    // Enforce daily cap (300s earned per tool per day)
    if (entry.e >= TOOL_DAILY_CAP) {
      return Response.json(
        {
          error: 'Daily cap reached for this tool',
          remaining: entry.r,
          earned: entry.e,
          capped: true,
        },
        { status: 429 },
      );
    }

    // Grant 30s: add to both remaining (r) and earned-today (e)
    entry.r += TOOL_AD_DURATION;
    entry.e += TOOL_AD_DURATION;
    banks[toolName] = entry;

    await setAccountFields(base44, account, {
      tool_banks: JSON.stringify(banks),
      tool_banks_date: today,
    });

    console.log(
      'Tool time granted:', user.id, toolName,
      'remaining:', entry.r, 'earned:', entry.e,
    );

    return Response.json({
      success: true,
      remaining: entry.r,
      earned: entry.e,
      capped: entry.e >= TOOL_DAILY_CAP,
    });
  } catch (error) {
    console.error('grant-tool-time error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}