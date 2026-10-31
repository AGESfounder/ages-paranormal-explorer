import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Tables whose rows belong to the deleting user, purged before the account is
// removed (App Store guideline 5.1.1(v)). Order rows hold shipping details and
// are purged as before. Billing ledgers (Base44Purchase, RevenueCatPurchase) and
// AdMob audit records are deliberately NOT listed: they are retained for
// accounting, tax, and fraud reasons.
const OWNER_TABLES = [
  'Evidence',
  'StopComment',
  'Report',
  'Favorite',
  'Investigation',
  'Order',
  'SavedTour',
  'TourAmenity',
  'DepthCameraDiagnostic',
];

// Server-owned tables keyed by user_id rather than created_by_id.
const USER_ID_TABLES = [
  'EnergyAccount',
  'AiOperation',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const failures: string[] = [];

    // Stop verification photos live on TourStop rows owned by the tour, not the
    // user, so created_by_id never matches them. Clear the photo fields only and
    // keep latitude, longitude, user_verified and verified_by_id so tour building,
    // address correction and route ordering behave exactly as before.
    //
    // Photos are cleared by UPLOADER, not by validator: verification_photo_by_id
    // records who supplied the picture, while verified_by_id records who confirmed
    // the coordinates. A photo another investigator added to a stop this user
    // validated is theirs and must survive this deletion. Photos saved before the
    // uploader field existed have no uploader, so they fall back to the validator
    // — the attribution they had before this split.
    try {
      const [byPhotoOwner, byValidator] = await Promise.all([
        base44.asServiceRole.entities.TourStop.filter({ verification_photo_by_id: user.id }),
        base44.asServiceRole.entities.TourStop.filter({ verified_by_id: user.id }),
      ]);
      const candidates = new Map<string, any>();
      for (const stop of [...byPhotoOwner, ...byValidator]) candidates.set(stop.id, stop);
      for (const stop of candidates.values()) {
        if (!stop.verification_photo_uri && !stop.verification_photo_url && !stop.has_verification_photo) continue;
        const legacyOwner = !stop.verification_photo_by_id && stop.verified_by_id === user.id;
        if (stop.verification_photo_by_id !== user.id && !legacyOwner) continue;
        await base44.asServiceRole.entities.TourStop.update(stop.id, {
          verification_photo_uri: '',
          verification_photo_url: '',
          has_verification_photo: false,
          verification_photo_by_id: '',
        });
      }
    } catch (e) {
      console.error('delete-account: clearing stop verification photos failed:', e);
      failures.push('stop verification photos');
    }

    for (const entityName of OWNER_TABLES) {
      try {
        await base44.asServiceRole.entities[entityName].deleteMany({ created_by_id: user.id });
      } catch (e) {
        console.error(`delete-account: purge ${entityName} failed:`, e);
        failures.push(entityName);
      }
    }

    for (const entityName of USER_ID_TABLES) {
      try {
        await base44.asServiceRole.entities[entityName].deleteMany({ user_id: user.id });
      } catch (e) {
        console.error(`delete-account: purge ${entityName} failed:`, e);
        failures.push(entityName);
      }
    }

    // Never remove the profile while any personal data could not be cleared: a
    // partial purge would orphan that data with no account left to retry from.
    if (failures.length > 0) {
      return Response.json({
        error: `Account not deleted because some data could not be removed (${failures.join(', ')}). Please try again.`,
        failed: failures,
      }, { status: 500 });
    }

    await base44.asServiceRole.entities.User.delete(user.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('delete-account failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});