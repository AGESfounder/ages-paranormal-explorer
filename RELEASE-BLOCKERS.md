# Release blocker review, 2026-10-14

## Release state: HOLD

No version edits, builds, native sync, GitHub sync, commits, pushes, or publication were performed in this work. Target versions remain iOS Build 27 and Android Version 20. Source values were read only (26 / 19); the existing automated release versioning is not bypassed.

## Completed implementation

- Every runtime frontend InvokeLLM and GenerateSpeech call now uses the paid-ai backend, including tours, state suggestions, stop enrichment, term banks, condensation, live Enhanced narration, and downloaded narration; the two backend coordinate-repair AI fallbacks also use the same protected executor. Device speech and cached playback are unchanged.
- The backend authenticates the caller and resolves the existing trusted purchase ledger before doing paid work. Generation requires Explorer+; narration preserves paid access to eligible narration balances. Admin behavior is unchanged.
- Server-computed provider-operation price: 1 manifestation unit per generation call; narration is ceil(actual submitted characters / 50), up to the existing 5,000-character provider limit. Client prices, balances, user IDs, arbitrary models, and empty/oversized speech are not accepted as authority.
- One conditional EnergyAccount update claims a server token and debits ALL required pools, before calling the provider. This is not the earlier read-difference spending algorithm. A losing caller cannot execute the provider.
- AiOperation receipts bind user + request ID + normalized input hash. Same-ID retries replay a privately stored result without re-executing or recharging. Changed inputs under the same ID conflict. Concurrent requests serialize on the account.
- Provider/output-storage failures reverse only the reservation's recorded pools through a token-guarded update. A persisted success is not refunded just because response delivery failed. A crashed reservation is recovered on a subsequent request after ten minutes, beyond the runtime's five-minute execution limit; there is no scheduled recovery yet.
- Large results use UploadPrivateFile, not entity fields. AiOperation is owner/admin-readable and admin-write-only. EnergyAccount retains owner/admin reads and admin-only writes.
- Separate frontend after-the-fact spending was removed, so a provider call and a later UI spend no longer charge the same operation twice.
- A failed ledger read cannot seed or rewrite balances. A first migration that would reduce any existing pool stops before writing, leaving the original record intact for review.

## Verification actually executed

The execSync import was repaired to use node:child_process. The complete updated verify-access-gating.mjs was executed, not just the previous 93-check subset. Final recorded result: **159 passed, 0 failed**, process exit 0. This includes the 108 repaired existing checks (new static guards and webhook event-id checks included) plus 51 isolated paid-AI checks using the real new operation/gateway modules with mocked storage/provider adapters.

The added checks cover fixed cost, invalid inputs, all-pool atomic reservation, exact-pool refunds, duplicate/concurrent requests, input-ID conflicts, insufficient energy with zero provider calls/writes, provider-failure refunds, repeated failed requests, lost success acknowledgements, interrupted reservations, cross-user isolation, non-destructive migration refusal, frontend direct-AI-call removal, and receipt write restrictions. The expected provider-failure test emits a diagnostic; it is not a test failure.

The deployed paid-ai endpoint rejected empty narration, an unsupported model, an unsupported voice, and an unknown operation kind with HTTP 400 before spending or calling AI. Coordinate repair rejected a missing tour ID with HTTP 400. No paid provider request or real non-admin charge was performed. New authorization-module syntax/lint checks passed; a whole-frontend parsing/lint pass with existing unused-import rules excluded also passed. The wider touched-page lint check still reports 16 pre-existing unused imports in StateTours, TourDetail, StopDetail, and Toolkit; they were not removed as unrelated cleanup. No build was run. Passing mocked checks does NOT prove live database concurrency, native runtime behavior, SSV delivery, or platform protection activation.

## Outstanding AI/security release blockers

1. **Direct API protection is NOT confirmed enabled.** Moving calls out of frontend source does not disable a malicious direct integration request. Base44 documents immediate, irreversible Core integration protection, gated by the Security scan compatibility recommendation. The available app-user connection could not inspect or change that owner-side control. Use the Security dashboard to confirm compatibility and enforce it when the migrated published/native clients are ready. Do not call this secured until direct InvokeLLM/GenerateSpeech requests are rejected server-side. Existing frontend upload/signed-URL integrations and installed older native clients must be checked before activation, because their compatibility is not established by the documentation.
2. **Logical-action charge parity is not finished.** The new gateway authorizes each provider operation, whereas some older flows charged once for a whole multi-call action (tour attempts, two-stop enrichment + rewrites, haunted-location fallbacks, offline condensation batches). Successful quality/fallback attempts with different inputs are separate paid calls today, not retries of the same request ID. Offline display estimates also still use the older grouped calculations. Coordinate-repair AI fallbacks previously had no separate energy charge and now use the same paid executor; their inclusion in the parent action's price and user consent must also be resolved before release. These workflows must be orchestrated/validated as complete server-owned jobs with their existing action-level price before release. HTTP retries already have exactly-once charging, but this does not prove action-level retry/price parity. No claim that the overall user experience/charging parity is complete.
3. **Grant-source trust still needs replacement.** The prior migration takes mutable User balances up to ceilings; a ceiling is not proof of earned energy. Existing-account absorb-on-ledger-marker-change can likewise import a crafted mirror up to that ceiling. Refunded rows contribute to the old Aura ceiling, and account-age-based maximum ad earnings are only a hypothetical maximum, not verified grants. The new AI executor deliberately reads the existing server account without invoking that absorber, but other existing grant/entitlement paths still use it. Therefore the full energy lifecycle cannot be called tamper-proof until trusted opening balances and provider-event grant entries replace mirror absorption.
4. The trusted resolver reads RevenueCatPurchase; Base44Purchase is not present in this workspace's entity files. Coverage of any legacy Base44 Payments/Stripe paid users must be established before calling all payment-provider entitlement paths preserved. Existing payment handlers/catalogs were not modified here.
5. Native UX, recovery after a process kill, a real non-admin multi-pool race, and direct-integration rejection still need end-to-end verification. A timed-out reservation is currently refunded when a later request triggers recovery, not proactively in the background.

## Read-only balance review

Nine user records and all 23 current RevenueCatPurchase records were inspected without updating them. There is only ONE EnergyAccount, belonging to TestGhostHunter (admin). It currently holds 0 Aura narration, 4 Aura manifestation, and 1 Aura save; the last prior audit restored the single save unit. It is not currently missing according to that recorded baseline. The previous misleading claim that the unit still needed a top-up is not supported by the current data. Historical losses cannot be reconstructed exactly because the previous seeding did not retain a before/after migration journal.

The other eight users have no EnergyAccount yet, so there is no evidence that this new-account seeding reduced them. Two have positive paid/Aura balances:

- **siegbry:** 2,386 monthly narration / 42 manifestation; 135 Aura narration / 15 manifestation / 0 save. Its current paid Flicker ledger records 135/15; an active Apple Investigator row is also present (sandbox). Older expired rows need careful classification, not automatic re-granting.
- **Pharmacist:** 2,400 monthly narration / 45 manifestation; 400 Aura narration / 81 manifestation / 0 save. Its paid Apparition row records 400/100, so the lower remaining manifestation amount must not be blindly topped back up to 100. An active Apple Investigator annual row is present (sandbox).

No bulk top-ups, real-account charges, refunds, or destructive balance edits were made during this review.

Potential reduction categories in the previous seeding approach: unrecorded legacy/admin/promotional Aura; older purchases missing per-pool granted amounts; earned rewards without a durable grant log; retained Aura-save units lacking purchase rows; monthly energy when the subscription ledger was unavailable/incomplete, expired, or not represented in RevenueCatPurchase; provider-specific pools not separated by the old ceiling calculation. None of these should be equated with forged energy automatically.

### Proposed reconciliation, not executed

1. Freeze automatic destructive migration and take immutable, private before-state snapshots of User mirrors, EnergyAccounts, purchase rows, provider event history, and available ad receipts.
2. Reconcile each verified transaction/event exactly once, with provider transaction IDs, product, store, environment, grant quantities, refund/revocation state, and an account owner. Never credit a purchase's original amount again just because current remaining energy is lower.
3. Reconstruct verified grants minus known spends/refunds where trustworthy histories exist. Where spend history is missing, require an explicitly reviewed opening balance rather than inventing a reconstruction or declaring a mutable balance trusted.
4. Classify unverified legacy/earned units as pending review, preserving their original snapshot; do not erase them or automatically make them spendable. Use provider records, prior exports, or documented admin awards to approve evidence-backed units.
5. Apply only a user-specific, admin-approved adjustment with a unique reconciliation ID, immutable reason/source references, a dry-run diff, and an atomic exactly-once grant marker. Separate sandbox and production. No bulk overwrite.
6. Have future purchase/renewal/refund handlers append trusted per-pool grant/reversal events and update EnergyAccount idempotently, independent of User mirrors. Mirror to User only for display. Add server-owned monthly-refill events rather than importing user-writable reset dates.

## Ad rewards: explicitly NOT secured by SSV

Current grant-ad-reward trusts the authenticated client's claim that an ad completed. A paid user can call it without watching an ad and receive 4 Aura narration + 1 Aura manifestation. The nominal cap is five claims/day (20/5 units), but the check and counter update are separate; concurrent requests can race past that cap. There is no reward-view idempotency key. Repeated requests can each grant until the limit, including a retry after a lost response. Tool-time grants similarly trust client completion and use read/modify/write banks; evidence-save and Device narration ad gates also need provider-backed consumption if ad viewing is to be enforced rather than merely displayed.

The existing admob-ssv endpoint DOES contain Google's ECDSA signature verification, a production rewarded-unit allow-list, user/custom-data correlation and an audit receipt. It explicitly writes audit records only and does NOT authorize or consume grants. Its transaction lookup + create is not a unique/atomic grant claim, and a signature alone is not proof that a reward was consumed once. Configuring the callback is not established by inspecting code, and no real signed callback was received in this work.

### Required SSV completion

- Configure both production rewarded units to send callbacks to https://accessible-ghost-exploration-solutions.base44.app/functions/admob-ssv and verify real delivery for each store (not only the console URL test).
- Issue an authenticated server-owned, single-use reward intent tied to user, purpose (Aura/tool/evidence/Device narration), eligible tool/action, unit, and expiry. Pass only its opaque reference in custom_data; retain signed user_id correlation.
- Validate Google's signature over the original signed query bytes with rotated verifier keys; validate the production unit, expected reward fields, timestamp/freshness, actual intent owner/purpose/expiry, and reject duplicate/ambiguous parameters and replay.
- Grant or mint a purpose-specific single-use entitlement ONLY after that provider callback verifies. Atomically claim the transaction/intent, increment the daily counter with a conditional bound, and grant the exact pools/time in the same server-controlled settlement. Use durable uniqueness or the account mutex; lookup-then-create alone is not enough for concurrent callbacks.
- Change grant-ad-reward/grant-tool-time and the relevant save/narration gates to consume a verified pending receipt once, never the client's rewarded boolean. Client reward events only start polling; pending callbacks show a pending state and remain recoverable after restart. Never grant from both the callback and client path.
- Exercise delayed, duplicate, replayed, wrong-user, wrong-unit, altered-signature, expired-intent, cancelled-ad and concurrent-cap cases. Keep preview simulations isolated from real grants.

Reference: https://developers.google.com/admob/android/ssv

## Explicitly preserved source paths

No changes were made to RevenueCat/Apple/Google billing handlers or product catalogs; SIEG session/end chime; Environmental Monitor tone synthesis or persisted tone preference; iOS person-only depth plugin; Android box detection; Codemagic versioning; native version files. This is a source-scope statement, not a claim of device testing.