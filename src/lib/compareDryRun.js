// Admin-only dry run of the batched stop enrichment.
//
// Rebuilds a live tour's stop content the batched way so it can be compared
// side by side with what is stored. The batcher itself only makes model calls —
// it never writes a record and never spends energy — so this is a safe preview:
// the only cost is the model credits, and the tour is left exactly as it was.
import { enrichStopBatch, ENRICH_BATCH_SIZE, isSingleSiteCategory } from '@/lib/enrichBatch';
import { updatesFromContent } from '@/lib/enrichStops';
import { ENRICHMENT_CREDITS_SINGLE_SITE, ENRICHMENT_CREDITS_MULTI_SITE } from '@/lib/costAnalysisModel';

const SKIP_STOP_TYPES = ['parking', 'shuttle'];

// Parking and shuttle stops are never enriched, so they are not compared.
export function enrichableStops(stops) {
  return (stops || []).filter((s) => !SKIP_STOP_TYPES.includes(s.stop_type));
}

export function pairCount(stopCount) {
  return Math.ceil((stopCount || 0) / ENRICH_BATCH_SIZE);
}

// Single-site tours pay a second call for the focus rewrite, so a pair costs
// twice what a multi-site pair costs.
export function creditsPerPair(category) {
  return isSingleSiteCategory(category) ? ENRICHMENT_CREDITS_SINGLE_SITE : ENRICHMENT_CREDITS_MULTI_SITE;
}

export function estimateComparisonCredits(category, stopCount, pairLimit) {
  const total = pairCount(stopCount);
  return (pairLimit ? Math.min(pairLimit, total) : total) * creditsPerPair(category);
}

export function wordCount(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

// Regenerate `stops` with the batched path, one pair at a time, and report what
// the batcher returned for each stop. force=true matches what the app does when
// it upgrades an older tour, which is the case that rewrites the most content.
//
// Per stop:
//   accepted — the batch passed the free cross-check and this is the content it
//              produced (post-processed exactly as the app would save it)
//   rejected — the pair failed the check, so the app discards the batch and
//              writes this stop one at a time, exactly as it does today
//   single   — the odd stop at the end of the tour, always written one at a time
//   error    — the call itself failed, same per-stop fallback
export async function runBatchedComparison(tour, stops, { pairLimit, onPair } = {}) {
  const enrichable = enrichableStops(stops);
  const siblingNames = enrichable.map((s) => s.name).filter(Boolean);
  const tourContext = {
    title: tour.title,
    category: tour.tour_category,
    introduction: tour.introduction,
  };

  const pairs = [];
  for (let i = 0; i < enrichable.length; i += ENRICH_BATCH_SIZE) {
    pairs.push(enrichable.slice(i, i + ENRICH_BATCH_SIZE));
  }
  const chosen = pairLimit ? pairs.slice(0, pairLimit) : pairs;

  const results = [];
  for (let p = 0; p < chosen.length; p++) {
    const batch = chosen[p];
    let contents = null;
    let error = null;

    // A lone stop is never batched — the app sends it down the single-stop path.
    if (batch.length === ENRICH_BATCH_SIZE) {
      try {
        contents = await enrichStopBatch(
          batch,
          { ...tourContext, siblingStopNames: siblingNames.filter((n) => !batch.some((b) => b.name === n)) },
          { mode: 'full', force: true }
        );
      } catch (e) {
        error = e?.message || 'Call failed';
      }
    }

    const entries = batch.map((stop, k) => {
      if (batch.length < ENRICH_BATCH_SIZE) return { stop, status: 'single', generated: null };
      const content = contents ? contents[k] : null;
      if (!content) return { stop, status: error ? 'error' : 'rejected', generated: null, error };
      return { stop, status: 'accepted', generated: updatesFromContent(stop, content, 'full') };
    });

    results.push({ index: p, entries });
    if (onPair) onPair(p + 1, chosen.length);
  }

  // What the same stops cost each way. One "call-set" = the content call, plus
  // the focus-rewrite call that single-site tours run. The old way paid one
  // call-set per stop; the batcher pays one per pair.
  const entries = results.flatMap((r) => r.entries);
  const perCallSet = creditsPerPair(tour.tour_category);
  const fallbackStops = entries.filter((e) => e.status !== 'accepted').length;
  const oldCredits = entries.length * perCallSet;
  const batchCredits = chosen.length * perCallSet;
  const fallbackCredits = fallbackStops * perCallSet;
  const newCredits = batchCredits + fallbackCredits;

  return {
    pairs: results,
    enrichableCount: enrichable.length,
    pairCount: pairs.length,
    ranPairs: chosen.length,
    cost: {
      stops: entries.length,
      pairs: chosen.length,
      perCallSet,
      oldCredits,
      batchCredits,
      fallbackStops,
      fallbackCredits,
      newCredits,
      savedCredits: oldCredits - newCredits,
      savedPercent: oldCredits > 0 ? Math.round(((oldCredits - newCredits) / oldCredits) * 100) : 0,
      // The user pays one manifestation unit per pair instead of one per stop.
      oldEnergy: entries.length,
      newEnergy: chosen.length,
    },
  };
}