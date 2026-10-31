import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import {
  ttlForMedia,
  canViewEvidence,
  STILL_TTL_SECONDS,
} from '../../shared/evidenceMedia.js';

// Issues a short-lived signed link to one piece of stored user media.
//
// The caller sends only what it wants to look at (kind + record id) — never a
// storage URI. This function decides whether that caller may see it and how
// long the link may live, so a client cannot mint a link for a record it is
// not allowed to read, and private storage URIs never reach the browser.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    const kind = body?.kind;
    if (!id || (kind !== 'evidence' && kind !== 'stop_photo')) {
      return Response.json({ error: 'id and a valid kind are required' }, { status: 400 });
    }

    let fileUri = '';
    let expiresIn = STILL_TTL_SECONDS;

    if (kind === 'evidence') {
      const record = await base44.asServiceRole.entities.Evidence
        .get(id)
        .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (!record) return Response.json({ error: 'Not found' }, { status: 404 });
      if (!canViewEvidence(record, user)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      fileUri = record.media_uri || '';
      if (!fileUri) return Response.json({ error: 'This evidence has no private media' }, { status: 404 });
      expiresIn = ttlForMedia(record.type, record.media_duration_seconds);
    } else {
      // Stop photos are community reference images: every signed-in user may
      // see them, exactly as they could before.
      const stop = await base44.asServiceRole.entities.TourStop
        .get(id)
        .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (!stop) return Response.json({ error: 'Not found' }, { status: 404 });
      fileUri = stop.verification_photo_uri || '';
      if (!fileUri) return Response.json({ error: 'This stop has no private photo' }, { status: 404 });
      expiresIn = STILL_TTL_SECONDS;
    }

    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUri,
      expires_in: expiresIn,
    });
    if (!signed_url) return Response.json({ error: 'Could not create a viewing link' }, { status: 502 });

    return Response.json({ url: signed_url, expires_in: expiresIn });
  } catch (error) {
    console.error('evidence-media-link failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}