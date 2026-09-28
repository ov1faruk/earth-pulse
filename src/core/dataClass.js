// Machine-readable data classification, shared by server and browser.
// Every visual element that shows data carries one of these, and the UI
// derives its labelling from it — never from ad-hoc strings.

export const DATA_CLASS = Object.freeze({
  REAL_NISAR: 'REAL_NISAR',
  REAL_OTHER_SATELLITE: 'REAL_OTHER_SATELLITE',
  REAL_CONTEXT: 'REAL_CONTEXT',
  DERIVED: 'DERIVED',
  DEMO: 'DEMO',
  SIMULATED: 'SIMULATED',
});

export const DATA_CLASS_LABEL = Object.freeze({
  REAL_NISAR: { short: 'NISAR DATA', long: 'Real NISAR observation', tone: 'real' },
  REAL_OTHER_SATELLITE: { short: 'SATELLITE DATA', long: 'Real data from another satellite', tone: 'real' },
  REAL_CONTEXT: { short: 'CONTEXT DATA', long: 'Real contextual data (not a satellite observation)', tone: 'context' },
  DERIVED: { short: 'DERIVED', long: 'Computed by EARTH//PULSE from real data', tone: 'derived' },
  DEMO: { short: 'DEMO SCENARIO', long: 'Demo scenario — not a real observation', tone: 'demo' },
  SIMULATED: { short: 'SIMULATED', long: 'Simulated visualization — illustrative, not data', tone: 'demo' },
});

/**
 * Where the currently displayed data came from (the fallback hierarchy):
 * LIVE → CACHED → ARCHIVED (pre-processed real data) → DEMO.
 */
export const FRESHNESS = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  STALE: 'STALE',
  ARCHIVED: 'ARCHIVED',
  DEMO: 'DEMO',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const FRESHNESS_LABEL = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  STALE: 'CACHED · SOURCE UNREACHABLE',
  ARCHIVED: 'ARCHIVED',
  DEMO: 'DEMO SCENARIO',
  UNAVAILABLE: 'DATA TEMPORARILY UNAVAILABLE',
});

export function isReal(dataClass) {
  return dataClass === DATA_CLASS.REAL_NISAR || dataClass === DATA_CLASS.REAL_OTHER_SATELLITE || dataClass === DATA_CLASS.REAL_CONTEXT;
}

/** Scientific-language guard: words the product must not use unless supported. */
export const OVERCLAIM_WORDS = ['proves', 'proved', 'caused by', 'definitely', 'certainly'];
