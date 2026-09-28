// EarthChangeStory catalog — the editorial layer.
//
// Each story is written in layers (human → scientific → evidence) and follows
// the integrity model: WHAT WE SAW / WHAT IT MAY MEAN / CONFIDENCE / HOW WE
// KNOW / WHAT ELSE COULD EXPLAIN IT / SOURCE. Every claim here was checked
// against the actual NISAR browse imagery produced by tools/build_stories.py;
// numbers are never written here — they are read from the data manifest at
// runtime (see {placeholders} filled by src/core/storyModel.js).
import { DATA_CLASS } from './dataClass.js';

export const PHENOMENA = {
  water: { label: 'WATER', color: '#48d6ff' },
  ground_motion: { label: 'GROUND MOVEMENT', color: '#ff5fa2' },
  agriculture: { label: 'AGRICULTURE', color: '#9be15d' },
  forest: { label: 'FOREST', color: '#3ddc84' },
  ice: { label: 'ICE', color: '#cfe8ff' },
};

/** @type {import('./storyModel.js').EarthChangeStory[]} */
export const STORIES = [
  {
    id: 'bangladesh-water',
    featured: true,
    location: { name: 'Bangladesh', region: 'Jamuna floodplain & Sylhet haor basin', lat: 24.65, lon: 90.45 },
    camera: { lat: 24.5, lon: 90.45, height: 520000, pitch: -62 },
    phenomenon: 'water',
    humanTitle: 'THE WATER CHANGED',
    scientificTerm: 'Surface-water extent change',
    tagline: 'A monsoon landscape, watched from orbit every 12 days.',
    summary:
      'Through the 2026 monsoon, NISAR imaged central Bangladesh every 12 days, day or night, through cloud. Calm water reflects radar away from the satellite, so it shows up dark.',
    whatWeSaw:
      'Dark, low-backscatter areas typical of open water grew along the braided Jamuna river and its floodplain between {changeFrom} and {changeTo}. EARTH//PULSE estimates about {becameWaterKm2} km² became dark-water-like in that period.',
    mayMean:
      'Consistent with seasonal monsoon flooding and rivers spreading over their floodplains. The haor wetlands in the northeast look inundated in every image, including the first one on {firstDate}.',
    confidence: { level: 'MEDIUM', why: 'The pattern is spatially coherent and follows the river system. The water estimate comes from quick-look images rather than calibrated backscatter.' },
    howWeKnow:
      'NISAR measures how much of its own L-band radar pulse comes back. Smooth water acts like a mirror and sends the pulse away, so it returns very little energy. Comparing repeat passes over the same frame shows where dark areas appeared or disappeared.',
    alternatives: [
      'Wind or rain roughening the water surface can make water look brighter and be missed.',
      'Flooded vegetation often looks BRIGHTER (double bounce), so it is not counted as water here.',
      'Very smooth bare soil or sand can look dark and be mistaken for water.',
      'Each browse image is contrast-stretched on its own, so small differences between dates may be processing artifacts.',
    ],
    impact: {
      note: 'Relevance only. No impact was measured.',
      relevantTo: ['farmland and rice paddies', 'river-bank communities', 'roads and embankments', 'wetland ecosystems'],
    },
    context:
      'Bangladesh sits on the delta of the Ganges, Brahmaputra (Jamuna) and Meghna rivers. Seasonal flooding in the monsoon months is part of the landscape.',
    radarExplainer: 'backscatter',
    evidenceKind: 'backscatter-series',
    beforeAfter: { before: 0, after: 'peak' },
    dataClass: DATA_CLASS.REAL_NISAR,
    derivedClass: DATA_CLASS.DERIVED,
  },
  {
    id: 'kumamoto-ground',
    location: { name: 'Kumamoto, Japan', region: 'Kyushu island', lat: 32.6043, lon: 130.6269 },
    camera: { lat: 32.45, lon: 130.65, height: 260000, pitch: -60 },
    phenomenon: 'ground_motion',
    humanTitle: 'THE GROUND MOVED',
    scientificTerm: 'Coseismic surface deformation (InSAR)',
    tagline: 'An earthquake, written into radar phase.',
    summary:
      'On {eventDate} a magnitude {eventMag} earthquake struck the Kumamoto region (USGS). NISAR had imaged this area before and after it from the same orbit track.',
    whatWeSaw:
      'Only the image pair spanning the earthquake ({pairRef} → {pairSec}) shows a compact set of tightly spaced color rings centered on the USGS epicenter. A sharp NE–SW line cuts through them where the pattern breaks.',
    mayMean:
      'Consistent with the ground surface deforming during the earthquake. The sharp break is consistent with fault slip reaching at or near the surface.',
    confidence: {
      level: 'HIGH',
      why: 'The pattern is localized, sits at the independently located USGS epicenter, and appears only in the pair that spans the event. Pairs before and after do not show it.',
    },
    howWeKnow:
      'Radar records the phase (the exact point in its wave cycle) of each echo. When two passes from the same position are compared, a change in distance to the ground of a fraction of the wavelength shifts the phase. Each full color cycle is a contour of equal ground movement toward or away from the satellite.',
    alternatives: [
      'Broad parallel bands appear in EVERY pair, before and after, and are most likely ionospheric, atmospheric or orbital effects rather than ground motion. L-band is especially sensitive to the ionosphere.',
      'Loss of coherence (grainy areas) can come from vegetation change or rain, and hides the signal there.',
      'Unwrapping errors can create false jumps near sharp discontinuities.',
    ],
    impact: {
      note: 'Relevance only. Damage and casualty figures are not derived from this data.',
      relevantTo: ['buildings and infrastructure along the fault', 'roads, bridges and pipelines crossing it', 'slopes prone to landslides'],
    },
    context: 'Kyushu lies on an active tectonic margin. The region also experienced a damaging earthquake sequence in April 2016.',
    radarExplainer: 'interferometry',
    evidenceKind: 'interferogram-series',
    beforeAfter: { before: 1, after: 2 },
    contextEvent: { provider: 'USGS', eventId: 'us6000tgb9' },
    dataClass: DATA_CLASS.REAL_NISAR,
  },
  {
    id: 'punjab-crops',
    location: { name: 'Punjab, India', region: 'Indo-Gangetic plain', lat: 30.9, lon: 75.85 },
    camera: { lat: 30.7, lon: 75.9, height: 420000, pitch: -62 },
    phenomenon: 'agriculture',
    humanTitle: 'THE FARMLAND CHANGED',
    scientificTerm: 'Seasonal backscatter change of croplands',
    tagline: 'A full farming year, seen by radar.',
    summary:
      'From {firstDate} to {lastDate} NISAR repeatedly imaged the plains of Punjab, one of the most intensively farmed regions on Earth.',
    whatWeSaw:
      'The whole plain changes its radar signature with the seasons. In late summer ({lastDate}), large areas turn strongly magenta: high co-polarized (HH) return relative to cross-polarized (HV).',
    mayMean:
      'Consistent with the summer crop season, when standing crops and flooded paddy fields change how radar scatters. Winter imagery is consistent with a different crop state.',
    confidence: { level: 'MEDIUM', why: 'The change is large and regionally coherent. Identifying specific crops would need field data or calibrated time series.' },
    howWeKnow:
      'Radar echoes depend on the structure and water content of what they hit. Stems, leaves and standing water in fields each scatter energy differently in the HH and HV polarizations.',
    alternatives: [
      'Soil moisture after rain or irrigation also brightens radar.',
      'The green blob in the May image is consistent with radio-frequency interference (RFI), not a land-surface change.',
      'The July image has a large no-data band at the top of the frame.',
    ],
    impact: { note: 'Relevance only.', relevantTo: ['crop monitoring', 'irrigation and water use', 'food security planning'] },
    context: 'Punjab typically has two main crop seasons: winter (rabi) and summer-monsoon (kharif).',
    radarExplainer: 'polarization',
    evidenceKind: 'backscatter-series',
    beforeAfter: { before: 0, after: 'last' },
    dataClass: DATA_CLASS.REAL_NISAR,
  },
  {
    id: 'rondonia-forest',
    location: { name: 'Rondônia, Brazil', region: 'Southern Amazon', lat: -9.9, lon: -62.9 },
    camera: { lat: -10.05, lon: -62.85, height: 420000, pitch: -62 },
    phenomenon: 'forest',
    humanTitle: 'WHERE THE FOREST WAS CLEARED',
    scientificTerm: 'Forest / non-forest structure in L-band backscatter',
    tagline: 'Radar sees through the clouds of the Amazon.',
    summary:
      'NISAR’s L-band radar penetrates into forest canopy and through the Amazon’s frequent cloud cover. Intact forest returns a uniform bright signal.',
    whatWeSaw:
      'Large blocks of uniform, bright texture (consistent with intact forest) meet dense “fishbone” patterns of darker plots along road networks.',
    mayMean:
      'The fishbone geometry is consistent with forest clearing along roads, a pattern long documented in Rondônia. These images show the pattern left behind, not the moment of clearing.',
    confidence: { level: 'MEDIUM', why: 'Forest and cleared land contrast strongly at L-band. Dating individual clearings needs a longer time series.' },
    howWeKnow:
      'L-band waves (~24 cm) scatter from trunks and branches inside the canopy. When the trees are removed, much less energy comes back, especially in cross-polarization (HV).',
    alternatives: [
      'Pastures, crops and regrowth can all look similar in a single image.',
      'From August the frames are single-polarization (HH only, shown in grey). Colour changes between June and later dates reflect this acquisition-mode change, NOT a land change.',
    ],
    impact: { note: 'Relevance only.', relevantTo: ['carbon storage', 'biodiversity', 'Indigenous and local communities', 'regional rainfall'] },
    context: 'Rondônia is one of the Brazilian Amazon states most affected by deforestation since the 1970s.',
    radarExplainer: 'forest',
    evidenceKind: 'backscatter-series',
    beforeAfter: { before: 0, after: 'last' },
    dataClass: DATA_CLASS.REAL_NISAR,
  },
  {
    id: 'greenland-ice',
    location: { name: 'West Greenland', region: 'Ice sheet near Ilulissat', lat: 69.17, lon: -49.9 },
    camera: { lat: 68.6, lon: -49.0, height: 900000, pitch: -60 },
    phenomenon: 'ice',
    humanTitle: 'THE ICE SHEET SURFACE CHANGED',
    scientificTerm: 'Seasonal backscatter change of the ice-sheet surface',
    tagline: 'A summer on the Greenland ice sheet.',
    summary: 'NISAR imaged the western margin of the Greenland ice sheet repeatedly between {firstDate} and {lastDate}.',
    whatWeSaw: 'The ice-sheet interior (bright, upper right) appeared noticeably darker in mid-August than in June, July or September.',
    mayMean: 'Consistent with summer surface melt: wet snow absorbs radar energy and returns less of it. As the surface refreezes, it brightens again.',
    confidence: { level: 'LOW', why: 'Only four usable dates, single polarization, and contrast-stretched quick-looks. Treat as a hint, not a measurement.' },
    howWeKnow: 'Dry snow is nearly transparent to L-band radar and returns strong echoes from layers beneath. Liquid water in the snow absorbs the signal.',
    alternatives: [
      'Browse images are contrast-stretched per date, so part of the brightness change could be processing.',
      'Changes in snow accumulation or surface roughness also alter backscatter.',
      'The NISAR offset product (GOFF) for this area shows glacier motion, but its provisional quick-look is noisy, so it is not used as evidence here.',
    ],
    impact: { note: 'Relevance only.', relevantTo: ['sea-level contribution', 'meltwater runoff', 'Arctic communities'] },
    context: 'The Ilulissat region drains a large part of the ice sheet through Sermeq Kujalleq (Jakobshavn Glacier).',
    radarExplainer: 'backscatter',
    evidenceKind: 'backscatter-series',
    beforeAfter: { before: 0, after: 2 },
    dataClass: DATA_CLASS.REAL_NISAR,
  },
];

export function storyById(id) {
  return STORIES.find((s) => s.id === id) || null;
}

/** Keyword routing for natural-language exploration ("a flood in Bangladesh"). */
export const TOPIC_KEYWORDS = {
  water: ['flood', 'water', 'river', 'wetland', 'monsoon', 'bangladesh', 'haor', 'delta', 'rain'],
  ground_motion: ['earthquake', 'quake', 'ground', 'fault', 'deformation', 'movement', 'moved', 'japan', 'kumamoto', 'subsidence'],
  agriculture: ['farm', 'crop', 'agriculture', 'rice', 'wheat', 'field', 'punjab', 'india'],
  forest: ['forest', 'tree', 'amazon', 'deforestation', 'rainforest', 'brazil', 'jungle'],
  ice: ['ice', 'glacier', 'greenland', 'snow', 'melt', 'arctic', 'polar'],
};

export function matchTopic(text) {
  const t = String(text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best ? STORIES.find((s) => s.phenomenon === best) : null;
}
