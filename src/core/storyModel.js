// Resolves an editorial story + its data manifest into an EarthChangeStory.
// Pure functions, shared by the server (/api/story/:id) and the browser
// (offline fallback that reads /data/stories/<id>/manifest.json directly).
import { DATA_CLASS } from './dataClass.js';

/**
 * @typedef {Object} EarthChangeStory
 * @property {string} id
 * @property {{name:string, region:string, lat:number, lon:number}} location
 * @property {object} geometry           GeoJSON footprint of the evidence
 * @property {string} phenomenon
 * @property {string} humanTitle
 * @property {string} scientificTerm
 * @property {string} summary
 * @property {string|null} beforeDate
 * @property {string|null} afterDate
 * @property {Array} timeline             one entry per real observation
 * @property {Array} observations         normalized NISAR frames
 * @property {object} evidence            derived products + context event
 * @property {object} interpretation      whatWeSaw / mayMean
 * @property {{level:string, why:string}} confidence
 * @property {string[]} alternativeExplanations
 * @property {Array} sources
 * @property {string} dataClass
 * @property {object} provenance
 */

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase() : '—';

export const formatDate = fmtDate;

function fill(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '—'));
}

function frameIndex(ref, frames, derived) {
  if (typeof ref === 'number') return Math.min(ref, frames.length - 1);
  if (ref === 'last') return frames.length - 1;
  if (ref === 'peak') return derived?.peakIndex ?? frames.length - 1;
  return 0;
}

export function resolveStory(story, manifest, { contextEvent = null, freshness = 'ARCHIVED', base = '' } = {}) {
  if (!manifest || !manifest.frames?.length) {
    return {
      ...story,
      available: false,
      dataClass: DATA_CLASS.DEMO,
      freshness: 'UNAVAILABLE',
      timeline: [],
      observations: [],
    };
  }
  const frames = manifest.frames;
  const derived = manifest.derived || null;
  const dir = `${base}/data/stories/${story.id}/`;
  const timeline = frames.map((f, i) => ({
    index: i,
    date: f.referenceDate ? f.secondaryDate : f.acquisitionStart,
    referenceDate: f.referenceDate || null,
    secondaryDate: f.secondaryDate || null,
    label: f.referenceDate ? `${fmtDate(f.referenceDate)} → ${fmtDate(f.secondaryDate)}` : fmtDate(f.acquisitionStart),
    image: dir + f.file,
    waterMask: f.waterMask ? dir + f.waterMask : null,
    rectangle: f.rectangle,
    footprint: f.footprint,
    granule: f.id,
    spansEvent: contextEvent && f.referenceDate ? f.referenceDate < contextEvent.time && contextEvent.time < f.secondaryDate : null,
    water: derived?.series?.[i] || null,
    observation: f,
  }));
  const bIdx = frameIndex(story.beforeAfter?.before ?? 0, frames, derived);
  const aIdx = frameIndex(story.beforeAfter?.after ?? 'last', frames, derived);
  const coseismic = timeline.find((t) => t.spansEvent);
  const vars = {
    firstDate: fmtDate(frames[0].acquisitionStart),
    lastDate: fmtDate(frames.at(-1).acquisitionStart),
    changeFrom: fmtDate(derived?.change?.fromDate),
    changeTo: fmtDate(derived?.change?.toDate),
    becameWaterKm2: derived?.change?.becameWaterKm2?.toLocaleString('en-US'),
    eventDate: contextEvent ? fmtDate(new Date(contextEvent.time).toISOString()) : null,
    eventMag: contextEvent?.mag,
    pairRef: coseismic ? fmtDate(coseismic.referenceDate) : null,
    pairSec: coseismic ? fmtDate(coseismic.secondaryDate) : null,
  };
  const sources = [
    {
      name: 'NISAR (NASA × ISRO) via ASF DAAC',
      dataClass: DATA_CLASS.REAL_NISAR,
      url: 'https://search.asf.alaska.edu/#/?dataset=NISAR',
      detail: `${frames.length} ${frames[0].productType} granules, ${manifest.source?.status || ''}`,
    },
  ];
  if (derived) sources.push({ name: 'EARTH//PULSE water approximation', dataClass: DATA_CLASS.DERIVED, detail: derived.method });
  if (contextEvent)
    sources.push({ name: `USGS earthquake ${contextEvent.id}`, dataClass: DATA_CLASS.REAL_CONTEXT, url: contextEvent.url, detail: `M${contextEvent.mag} · ${contextEvent.place}` });

  return {
    ...story,
    available: true,
    freshness,
    summary: fill(story.summary, vars),
    interpretation: { whatWeSaw: fill(story.whatWeSaw, vars), mayMean: fill(story.mayMean, vars) },
    confidence: story.confidence,
    alternativeExplanations: story.alternatives,
    geometry: { type: 'Polygon', coordinates: [frames[0].footprint] },
    beforeIndex: bIdx,
    afterIndex: aIdx,
    beforeDate: timeline[bIdx].date,
    afterDate: timeline[aIdx].date,
    timeline,
    observations: frames,
    evidence: { derived, contextEvent, notes: manifest.assetNotes, skipped: manifest.skipped || [] },
    sources,
    dataClass: DATA_CLASS.REAL_NISAR,
    provenance: {
      pipeline: 'tools/build_stories.py',
      generatedAt: manifest.generatedAt,
      query: manifest.source?.query,
      access: manifest.source?.access,
      status: manifest.source?.status,
    },
  };
}

/** Normalize a USGS event GeoJSON Feature into the context shape. */
export function normalizeUsgsEvent(feature) {
  const p = feature?.properties || {};
  const c = feature?.geometry?.coordinates || [];
  return {
    id: feature?.id,
    mag: p.mag,
    place: p.place || p.title,
    time: new Date(p.time).toISOString(),
    lon: c[0],
    lat: c[1],
    depthKm: c[2],
    url: p.url,
    dataClass: DATA_CLASS.REAL_CONTEXT,
  };
}
