import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Grants 30 seconds of tool use time to an Observer user after they watch a
// rewarded ad. The server-side tool_banks counter (JSON map on the User entity)
// tracks remaining + earned-today per tool to prevent localStorage spoofing.
//
// Daily cap: 300s (5 min) earned per tool per day — 10 ad watches max.
// Only Observer (free) users need ad-gated tool time; Seeker+ is ad-free.
// The tool_banks structure: { "Tool Name": { r: remaining, e: earned_today } }
// Resets daily via tool_banks_date comparison.

const TOOL_AD_DURATION = 30;
const TOOL_DAILY_CAP = 300;

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

    // Only Observer users need ad-gated tool time. Admins can test.
    const planId = user.plan || 'observer';
    if (planId !== 'observer' && user.role !== 'admin') {
      return Response.json(
        { error: 'Ad-gated tools are only for free (Observer) users' },
        { status: 403 },
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // Parse existing tool_banks (JSON string on User entity)
    let banks = {};
    try {
      banks = user.tool_banks ? JSON.parse(user.tool_banks) : {};
    } catch {
      banks = {};
    }

    // Reset all counters if it's a new day
    if (user.tool_banks_date !== today) {
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

    await base44.asServiceRole.entities.User.update(user.id, {
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