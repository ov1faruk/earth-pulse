// Curated, sourced facts for the story page. Every figure carries a `src` key
// into SOURCES so the UI can always show where a number came from. Figures
// were compiled on 13 November 2026; death tolls and loss estimates for 2026
// events are still being revised by the agencies that publish them.
// (Compiled and written with AI assistance — see README → AI disclosure.)

export const COMPILED_ON = '2026-11-13';

export const SOURCES = {
  // ----- NASA data, APIs and tools -----
  gistemp: { group: 'NASA', label: 'NASA GISS Surface Temperature Analysis (GISTEMP v4)', url: 'https://data.giss.nasa.gov/gistemp/' },
  gibs: { group: 'NASA', label: 'NASA GIBS / Worldview Snapshots — MODIS, VIIRS and HLS imagery', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
  worldview: { group: 'NASA', label: 'NASA Worldview', url: 'https://worldview.earthdata.nasa.gov/' },
  hls: { group: 'NASA', label: 'Harmonized Landsat Sentinel-2 (HLS) — NASA LP DAAC', url: 'https://www.earthdata.nasa.gov/data/projects/hls' },
  power: { group: 'NASA', label: 'NASA POWER — daily rainfall and temperature (MERRA-2, IMERG-corrected)', url: 'https://power.larc.nasa.gov/' },
  firms: { group: 'NASA', label: 'NASA FIRMS — active fire detections (VIIRS, MODIS)', url: 'https://firms.modaps.eosdis.nasa.gov/' },
  eonet: { group: 'NASA', label: 'NASA EONET v3 — Earth Observatory Natural Event Tracker', url: 'https://eonet.gsfc.nasa.gov/' },
  cmr: { group: 'NASA', label: 'NASA CMR and ASF DAAC — NISAR L2 GCOV / GUNW (NASA/JPL-Caltech × ISRO)', url: 'https://search.asf.alaska.edu/' },
  nisar: { group: 'NASA', label: 'NISAR mission — NASA Jet Propulsion Laboratory', url: 'https://nisar.jpl.nasa.gov/' },
  nsidc: { group: 'NASA', label: 'NSIDC Sea Ice Index v4 (NASA NSIDC DAAC)', url: 'https://nsidc.org/data/g02135' },
  climate_nasa: { group: 'NASA', label: 'NASA Vital Signs of the Planet (climate.nasa.gov)', url: 'https://climate.nasa.gov/vital-signs/' },
  sealevel_nasa: { group: 'NASA', label: 'NASA Sea Level Change portal (JPL)', url: 'https://sealevel.nasa.gov/' },
  // ----- Other agencies -----
  noaa_co2: { group: 'Agencies', label: 'NOAA Global Monitoring Laboratory — Mauna Loa CO₂', url: 'https://gml.noaa.gov/ccgg/trends/' },
  noaa_lsa: { group: 'Agencies', label: 'NOAA Laboratory for Satellite Altimetry — global mean sea level', url: 'https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/' },
  usgs: { group: 'Agencies', label: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/' },
  gdacs: { group: 'Agencies', label: 'GDACS — Global Disaster Alert and Coordination System (EC JRC / UN OCHA)', url: 'https://www.gdacs.org/' },
  worldbank: { group: 'Agencies', label: 'World Bank Open Data — GDP and population', url: 'https://data.worldbank.org/' },
  charter: { group: 'Agencies', label: 'International Charter: Space and Major Disasters — Flood in Nepal activation', url: 'https://disasterscharter.org/' },
  // ----- Research and assessments -----
  ipcc_spm: { group: 'Research', label: 'IPCC AR6 WG1 (2021), Summary for Policymakers, Table SPM.1 — warming by scenario', url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/' },
  ipcc_ch9: { group: 'Research', label: 'IPCC AR6 WG1 (2021), Chapter 9, Table 9.9 — global mean sea level projections', url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-9/' },
  shugar2020: { group: 'Research', label: 'Shugar et al. (2020), "Rapid worldwide growth of glacial lakes since 1990", Nature Climate Change 10, 939–945', url: 'https://www.nature.com/articles/s41558-020-0855-4' },
  wwa_france: { group: 'Research', label: 'World Weather Attribution (2026) — severe wildfire conditions in France and Spain', url: 'https://www.worldweatherattribution.org/climate-change-increases-likelihood-of-compounding-drivers-of-severe-wildfire-conditions-in-france-and-spain/' },
  conversation_nepal: { group: 'Research', label: 'The Conversation (2026) — "Tsunami of dirt: what caused Nepal\'s deadly glacial flood?"', url: 'https://theconversation.com/tsunami-of-dirt-what-caused-nepals-deadly-glacial-flood-290615' },
  earthsky_nepal: { group: 'Research', label: 'EarthSky (2026) — Nepal flash flood: what caused it?', url: 'https://earthsky.org/earth/nepal-flash-flood-glacier-collapse-landslide-aug-26-2026/' },
  wb_ditwah: { group: 'Research', label: 'World Bank GRADE report (22 Dec 2025) — Cyclone Ditwah damage in Sri Lanka', url: 'https://www.worldbank.org/en/news/press-release/2025/12/22/damage-from-cyclone-ditwah-in-sri-lanka-estimated-at-4-1-billion' },
  munichre: { group: 'Research', label: 'Munich Re (2026) — natural disaster review, first half of 2026', url: 'https://www.munichre.com/en/company/media-relations/media-information-and-corporate-news/media-information/2026/natural-disaster-figures-first-half-2026.html' },
  swissre: { group: 'Research', label: 'Swiss Re Institute (2026) — first-half 2026 insured catastrophe losses', url: 'https://www.swissre.com/institute/research/topics-and-risk-dialogues/climate-and-natural-catastrophe-risk/first-half-2026-insured-catastrophe-losses.html' },
  mongabay_senyar: { group: 'Research', label: 'Mongabay (Dec 2025) — Sumatra flood catastrophe and the Batang Toru forest', url: 'https://news.mongabay.com/2025/12/death-toll-rises-in-sumatra-flood-catastrophe-as-govt-moves-to-protect-batang-toru-forest/' },
  // ----- Event records -----
  wiki_nepal: { group: 'Event records', label: 'Wikipedia — 2026 Nepal floods (compiles NDRRMA, UNDP, UNICEF, ADB, World Bank, ILO and USGS reporting)', url: 'https://en.wikipedia.org/wiki/2026_Nepal_floods' },
  un_nepal: { group: 'Event records', label: 'UN News (Aug 2026) — Nepal flooding deaths surpass 900 as needs climb', url: 'https://news.un.org/en/story/2026/08/1168233' },
  aljazeera_nepal: { group: 'Event records', label: 'Al Jazeera (27 Aug 2026) — Nepal–Tibet floods: what is a glacial collapse?', url: 'https://www.aljazeera.com/features/2026/8/27/nepal-tibet-floods-what-is-a-glacial-collapse-how-common-is-it' },
  wiki_venezuela: { group: 'Event records', label: 'Wikipedia — 2026 Venezuela earthquakes', url: 'https://en.wikipedia.org/wiki/2026_Venezuela_earthquakes' },
  wiki_colombia: { group: 'Event records', label: 'Wikipedia — 2026 Colombia earthquake', url: 'https://en.wikipedia.org/wiki/2026_Colombia_earthquake' },
  wiki_mindanao: { group: 'Event records', label: 'Wikipedia — 2026 Mindanao earthquake', url: 'https://en.wikipedia.org/wiki/2026_Mindanao_earthquake' },
  wiki_senyar: { group: 'Event records', label: 'Wikipedia — Cyclone Senyar', url: 'https://en.wikipedia.org/wiki/Cyclone_Senyar' },
  cnbc_review: { group: 'Event records', label: 'CNBC (8 Sep 2026) — a month of natural disasters in review', url: 'https://www.cnbc.com/2026/09/08/natural-disasters-month-review-earthquake-volcano-flood.html' },
  euronews_france: { group: 'Event records', label: 'Euronews (22 Jul 2026) — France suffers record wildfire destruction', url: 'https://www.euronews.com/my-europe/2026/07/22/france-suffers-record-wildfire-destruction-by-mid-july' },
  feux_france: { group: 'Event records', label: 'FeuxFrance — 2026 burned area in France from EFFIS (to 21 Oct 2026)', url: 'https://feuxfrance.com/en/' },
  // ----- Preparedness guidance -----
  ifrc: { group: 'Preparedness', label: 'IFRC — What to do before, during and after disasters', url: 'https://www.ifrc.org/our-work/disasters-climate-and-crises/what-disaster' },
  ready: { group: 'Preparedness', label: 'Ready.gov — hazard-by-hazard preparedness guidance', url: 'https://www.ready.gov/be-informed' },
  undrr: { group: 'Preparedness', label: 'UNDRR — Early Warnings for All', url: 'https://www.undrr.org/implementing-sendai-framework/sendai-framework-action/early-warnings-for-all' },
};

// ---------- IPCC AR6 scenarios (published values only) ----------
export const SCENARIOS = [
  { id: 'ssp119', label: 'SSP1-1.9', blurb: 'Very low emissions — net zero CO₂ around 2050', color: '#7fe6ff',
    temp: [[2030, 1.5, 1.2, 1.7], [2050, 1.6, 1.2, 2.0], [2090, 1.4, 1.0, 1.8]], sea: [[2050, 0.18, 0.15, 0.23], [2100, 0.38, 0.28, 0.55]] },
  { id: 'ssp126', label: 'SSP1-2.6', blurb: 'Low emissions — net zero CO₂ after 2050', color: '#9be15d',
    temp: [[2030, 1.5, 1.2, 1.8], [2050, 1.7, 1.3, 2.2], [2090, 1.8, 1.3, 2.4]], sea: [[2050, 0.19, 0.16, 0.25], [2100, 0.44, 0.32, 0.62]] },
  { id: 'ssp245', label: 'SSP2-4.5', blurb: 'Intermediate — emissions stay near today\'s until mid-century', color: '#ffd166',
    temp: [[2030, 1.5, 1.2, 1.8], [2050, 2.0, 1.6, 2.5], [2090, 2.7, 2.1, 3.5]], sea: [[2050, 0.20, 0.17, 0.26], [2100, 0.56, 0.44, 0.76]] },
  { id: 'ssp370', label: 'SSP3-7.0', blurb: 'High emissions — CO₂ doubles by 2100', color: '#ff9447',
    temp: [[2030, 1.5, 1.2, 1.8], [2050, 2.1, 1.7, 2.6], [2090, 3.6, 2.8, 4.6]], sea: [[2050, 0.22, 0.18, 0.27], [2100, 0.68, 0.55, 0.90]] },
  { id: 'ssp585', label: 'SSP5-8.5', blurb: 'Very high emissions — CO₂ doubles by 2050', color: '#ff4d6d',
    temp: [[2030, 1.6, 1.3, 1.9], [2050, 2.4, 1.9, 3.0], [2090, 4.4, 3.3, 5.7]], sea: [[2050, 0.23, 0.20, 0.29], [2100, 0.77, 0.63, 1.01]] },
];
export const SCENARIO_NOTE = {
  temp: 'Points are the IPCC AR6 best estimates for the 20-year periods 2021–2040, 2041–2060 and 2081–2100, plotted at each period\'s midpoint, relative to 1850–1900. Shading is the very likely (5–95%) range. Lines between points are straight connectors, not model output.',
  sea: 'Global mean sea level rise relative to 1995–2014: IPCC AR6 median with the likely (17–83%) range, for 2050 and 2100. It excludes low-likelihood ice-sheet collapse, which could add more than a metre under SSP5-8.5.',
};

// ---------- Nepal 2026 ----------
export const NEPAL = {
  title: 'The Langtang glacier collapse and Trishuli flood',
  date: '2026-08-26',
  center: [28.27, 85.37],
  summary: 'At 08:37 on 26 August 2026 a mass of glacier ice and rock, about 600 m wide, broke off near Langtang Lirung at roughly 5,200 m and fell about 1,200 m. It turned into a debris flow that destroyed the Gyirong Port border crossing seven minutes later and swept 72 km down the Trishuli River. It is Nepal\'s deadliest disaster since the 2015 earthquake.',
  toll: [
    { v: 1455, label: 'deaths in Nepal', note: 'as of 5 Oct 2026', src: 'wiki_nepal' },
    { v: 5285, label: 'people missing in Nepal', note: '650 of them foreign nationals from 38 countries', src: 'wiki_nepal' },
    { v: 9287, label: 'injured', src: 'wiki_nepal' },
    { v: 13795, label: 'people rescued', note: 'by the end of search and rescue on 5 Oct', src: 'wiki_nepal' },
  ],
  china: 'In Tibet, China reported 43 deaths and 519 missing (as of 16 Sep). Independent reporting there is restricted, and advocacy groups say the true toll is higher.',
  timeline: [
    ['8 Jan – 18 Aug', 'Satellite analysis later showed the glacier north of Langtang Lirung creeping about 10 mm a month, then accelerating in the final weeks.', 'signal'],
    ['19 Aug', 'NISAR images the area on track 98 — the last radar pass before the collapse.', 'sat'],
    ['24 Aug', 'Sentinel-2 passes over, but monsoon cloud hides most of the valley.', 'sat'],
    ['26 Aug · 08:37', 'The ice and rock mass fails. Seismometers worldwide record it as a magnitude 5.2 surface-wave event — generated by the collapse itself, not an earthquake.', 'event'],
    ['08:44', 'Seven minutes later a surveillance camera records the flood destroying Gyirong Port. Debris moves at about 52 m/s (190 km/h).', 'event'],
    ['09:00', 'Nepal\'s Department of Hydrology and Meteorology is informed. Upstream monitoring stations have already been swept away.', 'warn'],
    ['09:15', 'First text alerts: 679,295 warning messages are sent within one minute to five districts.', 'warn'],
    ['~11:37', 'A second landslide, recorded as a magnitude 4.2 event.', 'event'],
    ['27–30 Aug', 'A barrier lake of 2 million m³ forms upstream, overflows slightly on 28 Aug, then drains.', 'event'],
    ['31 Aug', 'NISAR images the area again — the first radar pass after the flood. Rescuers blast into a hydropower tunnel to reach trapped workers.', 'sat'],
    ['4–5 Sep', 'Three survivors are pulled from the tunnel after nine days.', 'resp'],
    ['5 Oct', 'Formal search and rescue ends.', 'resp'],
  ],
  cause: {
    natural: [
      'Steep, tectonically rising terrain: the collapse zone sits above 5,000 m on one of the steepest mountain fronts on Earth.',
      'The same massif failed in 2015, when earthquakes triggered an avalanche that buried Langtang village.',
      'No rain was reported at the Rasuwa district headquarters that morning — this was not a monsoon flood.',
    ],
    human: [
      'Warming weakens permafrost, the "glue" that holds rock and ice together. Researchers quoted by the BBC, CNN and NPR said climate change probably made the collapse more likely.',
      'Exposure: 12 hydropower projects, a customs yard and a major trade crossing sat on the valley floor, with more than 900 hydropower workers in the flood path.',
      'The early-warning system was tuned to monsoon water levels, so a collapse-driven flood overran it within minutes.',
    ],
    src: ['wiki_nepal', 'conversation_nepal', 'earthsky_nepal'],
  },
  places: [
    { name: 'Collapse zone, near Langtang Lirung', lat: 28.29, lon: 85.5, kind: 'source' },
    { name: 'Gyirong Port / Rasuwagadhi (destroyed, +7 min)', lat: 28.277, lon: 85.378, kind: 'hit' },
    { name: 'Syafrubesi', lat: 28.163, lon: 85.342, kind: 'hit' },
    { name: 'Dhunche', lat: 28.107, lon: 85.297, kind: 'hit' },
    { name: 'Betrawati', lat: 27.975, lon: 85.183, kind: 'hit' },
    { name: 'Trishuli Bazar / Bidur', lat: 27.91, lon: 85.15, kind: 'hit' },
    { name: 'Devighat', lat: 27.86, lon: 85.11, kind: 'hit' },
    { name: 'Chitwan (warnings issued)', lat: 27.68, lon: 84.43, kind: 'warn' },
    { name: 'Nawalparasi — victims found 250 km downstream', lat: 27.53, lon: 83.95, kind: 'far' },
    { name: 'Kathmandu', lat: 27.72, lon: 85.32, kind: 'ref' },
  ],
  regionBox: { south: 27.2, west: 83.6, north: 28.7, east: 86.0 },
  views: [
    { id: 'overview', label: 'Langtang valley', box: '28.05–28.45° N, 85.10–85.60° E', before: '2025-11-10', after: '2026-10-23' },
    { id: 'border', label: 'Border crossing, close-up', box: '28.20–28.34° N, 85.30–85.475° E', before: '2025-11-10', after: '2026-10-23' },
  ],
  nisar: {
    key: '098_A_016_4005', lat: 28.27, lon: 85.37,
    before: '2026-08-19', after: '2026-08-31',
    crop: { south: 28.02, west: 85.05, north: 28.5, east: 85.65 },
  },
};

// The cascade: one event followed through seven systems. All Nepal, all sourced.
export const RIPPLE = [
  { id: 'environment', label: 'Environment', color: '#9be15d', lead: 'The valley floor is rebuilt in minutes.',
    facts: [['197–492 million m³', 'of ice and rock mobilised'], ['2.2 million tonnes', 'of debris left behind (UNDP)'], ['1,806 ha', 'of farmland damaged'], ['1.5 m+', 'of silt deposited in the main disaster zone']] },
  { id: 'economy', label: 'Economy', color: '#ffd166', lead: 'Physical damage becomes lost production.',
    facts: [['US$1.8 billion', 'in damage (रू 277.79 bn)'], ['US$883 million', 'in economic losses'], ['US$4.78 billion', 'estimated rebuilding cost'], ['12 hydropower projects', 'damaged — 430.7 MW offline, 10.6% of Nepal\'s hydro and solar']] },
  { id: 'finance', label: 'Finance & trade', color: '#ffb347', lead: 'A trade artery closes and capital is destroyed.',
    facts: [['30%', 'of Nepal–China trade used this crossing'], ['17 bank branches', 'and about 4,800 businesses damaged'], ['400+ containers', 'and about 1,000 electric vehicles swept away'], ['CN¥450 million', 'insured damage on the Chinese side']] },
  { id: 'gdp', label: 'GDP', color: '#ff9447', lead: 'The national outlook is marked down.',
    facts: [['4.5% → 4.1%', 'Asian Development Bank growth forecast'], ['3.7%', 'World Bank forecast after the floods'], ['21,400 jobs', 'disrupted within 4 km of the flood (ILO)'], ['रू 52.67 billion', 'tourism-sector losses']] },
  { id: 'health', label: 'Health', color: '#ff7a8a', lead: 'Clean water and clinics fail when they are needed most.',
    facts: [['7', 'health facilities destroyed'], ['5 of 15', 'water sources tested in Bidur had E. coli'], ['2,600 children', 'under five needed treatment for severe wasting'], ['59,732 people', 'vaccinated against cholera, tetanus-diphtheria and measles']] },
  { id: 'mind', label: 'Mind', color: '#c8a6ff', lead: 'Loss without a body to mourn.',
    facts: [['5,285', 'families waiting on a missing person'], ['540 children', 'separated from a parent; 102 orphaned'], ['150+', 'mental health professionals deployed'], ['1,239 people', 'given psychological first aid by 3 Sep']] },
  { id: 'society', label: 'Society', color: '#7fe6ff', lead: 'Schools, roads and trust take years to rebuild.',
    facts: [['7,570 houses', 'destroyed'], ['18 schools', 'destroyed or damaged — 9,000+ students affected'], ['109 bridges', 'damaged (68 suspension, 41 road)'], ['~1.6 million people', 'affected, according to NDRRMA']] },
];

// ---------- A year of disasters (13 Nov 2025 – 13 Nov 2026) ----------
// box = [south, west, north, east] for imagery; iso3 for the World Bank lookup.
export const EVENTS = [
  { id: 'senyar', type: 'cyclone', title: 'Cyclone Senyar', place: 'Sumatra, Malay Peninsula, southern Thailand', date: '2025-11-26', lat: 1.74, lon: 98.78, iso3: 'IDN',
    box: [0.2, 97.2, 4.2, 101.2], imgFrom: '2025-11-12', imgTo: '2025-12-14',
    what: 'A weak but exceptionally rare cyclone formed in the Strait of Malacca — the first on reliable record to form there — and stalled over northern Sumatra. Days of rain sent floods and landslides through deforested watersheds.',
    deaths: 1501, deathsNote: 'at least, across Indonesia, Malaysia and Thailand',
    figures: [['1,501+', 'deaths in three countries'], ['3rd costliest', 'tropical cyclone on record outside the North Atlantic'], ['2nd', 'cyclone ever documented in the Strait of Malacca']],
    natural: ['A cyclone forming almost on the equator, where the Coriolis effect is normally too weak', 'La Niña conditions and very warm seas'],
    human: ['Years of forest loss in Sumatra\'s upper watersheds, which researchers say magnified the floods; logs were swept into villages', 'Indonesia\'s environment minister said the flooding "cannot be attributed solely to natural causes"'],
    research: ['mongabay_senyar', 'wiki_senyar'], src: 'wiki_senyar' },
  { id: 'ditwah', type: 'cyclone', title: 'Cyclone Ditwah', place: 'Sri Lanka', date: '2025-11-28', lat: 7.5, lon: 80.7, iso3: 'LKA',
    box: [5.7, 79.2, 10.0, 82.3], imgFrom: '2025-11-14', imgTo: '2025-12-16',
    what: 'Ditwah brought floods and landslides to all 25 districts of Sri Lanka. The World Bank\'s rapid assessment put direct physical damage at about 4% of the country\'s GDP.',
    deaths: 640, deathsNote: 'more than (AFP, late December 2025)', damageUsd: 4.1e9, damageNote: 'direct physical damage, World Bank GRADE',
    figures: [['640+', 'deaths'], ['US$4.1 billion', 'direct damage, about 4% of GDP'], ['~2 million', 'people affected in 500,000 families'], ['US$1.735 billion', 'of the damage was to roads, bridges, rail and water networks']],
    natural: ['An intense late-season cyclone crossing the whole island', 'Steep central highlands prone to landslides'],
    human: ['Infrastructure and housing concentrated in floodplains and on unstable slopes', 'Limited fiscal space after the 2022 debt crisis: recovery relied on a US$206 million IMF emergency loan and repurposed World Bank funds'],
    research: ['wb_ditwah'], src: 'wb_ditwah' },
  { id: 'mindanao', type: 'earthquake', title: 'Mindanao earthquake, M 7.8', place: 'Sarangani, Philippines', date: '2026-06-08', lat: 5.6, lon: 125.1, iso3: 'PHL',
    box: [4.6, 123.9, 7.4, 126.7], imgFrom: '2026-05-25', imgTo: '2026-06-22',
    what: 'A magnitude 7.8 earthquake on the Cotabato Trench subduction zone struck offshore southern Mindanao — among the most destructive in the Philippines in five decades.',
    deaths: 106, deathsNote: 'at least',
    figures: [['106+', 'deaths'], ['1,300+', 'injured'], ['138,500+', 'homes damaged or destroyed'], ['30%+', 'of homes damaged in General Santos']],
    natural: ['Subduction along the Cotabato Trench — a known, active plate boundary'],
    human: ['Building quality: the share of homes damaged was highest in the poorest coastal towns', 'Earthquakes cannot be prevented or predicted; the toll is decided by construction standards and preparedness'],
    research: ['wiki_mindanao', 'usgs'], src: 'wiki_mindanao' },
  { id: 'venezuela', type: 'earthquake', title: 'Venezuela doublet earthquakes, M 7.2 + M 7.5', place: 'Yaracuy and La Guaira, Venezuela', date: '2026-06-24', lat: 10.6, lon: -67.0, iso3: 'VEN',
    box: [9.4, -69.0, 11.6, -65.4], imgFrom: '2026-06-10', imgTo: '2026-07-08',
    what: 'Two large strike-slip earthquakes 30 seconds apart: a magnitude 7.2 near San Felipe, then a magnitude 7.5 off La Guaira. It was the costliest disaster of the first half of 2026, and the strongest earthquake in Venezuela since 1900.',
    deaths: 6500, deathsNote: 'at least, officially confirmed by August 2026; independent analyses suggest far more', damageUsd: 20e9, damageNote: 'estimated economic loss, Swiss Re',
    figures: [['6,500+', 'confirmed deaths'], ['~226,700', 'injured or hospitalised'], ['80%', 'of buildings collapsed in La Guaira state'], ['~US$20 billion', 'estimated losses (Swiss Re)']],
    natural: ['Strike-slip faulting on the boundary between the Caribbean and South American plates'],
    human: ['Dense, poorly reinforced housing on steep coastal slopes', 'USGS PAGER warned early that the toll could exceed 10,000 — a forecast based on building vulnerability, not shaking alone'],
    research: ['wiki_venezuela', 'swissre', 'usgs'], src: 'wiki_venezuela' },
  { id: 'france', type: 'wildfire', title: 'France\'s record wildfire season', place: 'Gironde and southern France', date: '2026-07-20', lat: 44.6, lon: -0.8, iso3: 'FRA',
    box: [43.6, -2.0, 45.6, 0.7], imgFrom: '2026-07-06', imgTo: '2026-08-10', fires: true,
    what: 'By mid-July France had already burned more land than in any full year on record. One fire in Gironde burned about 40,000 hectares — the second largest in France since the Second World War.',
    deaths: null,
    figures: [['98,523 ha', 'burned in 2026 to 21 Oct (EFFIS) — 6.8× the average'], ['66,300 ha', 'the previous annual record, set in 2022'], ['~40,000 ha', 'burned by the Gironde fire alone'], ['167,000', 'people evacuated in France']],
    natural: ['A prolonged heatwave and drought dried forests and soils', 'Strong winds during the main fire runs'],
    human: ['World Weather Attribution found climate change made the combination of heat, drought and wind behind these fires more likely', 'Most wildfires in Europe are started by people, deliberately or by accident'],
    research: ['wwa_france', 'euronews_france', 'feux_france'], src: 'feux_france' },
  { id: 'colombia', type: 'earthquake', title: 'Chocó earthquake, M 7.4–7.5', place: 'Chocó, Colombia', date: '2026-08-10', lat: 5.7, lon: -76.6, iso3: 'COL',
    box: [4.2, -78.2, 7.2, -75.0], imgFrom: '2026-07-27', imgTo: '2026-08-24',
    what: 'A magnitude 7.4–7.5 earthquake in Colombia\'s Pacific department of Chocó damaged cities across the west of the country, including Cali, Pereira, Quibdó, Manizales and Armenia.',
    deaths: 335, deathsNote: 'at least, with 111 confirmed missing', damageUsd: 9.57e9, damageNote: 'government preliminary loss estimate',
    figures: [['335+', 'deaths'], ['4,600+', 'injured'], ['111', 'confirmed missing'], ['US$9.57 billion', 'preliminary loss estimate (government)']],
    natural: ['Subduction of the Nazca plate beneath South America'],
    human: ['Damage spread across several large cities built before modern seismic codes', 'Chocó is Colombia\'s poorest department, with limited road access for rescue'],
    research: ['wiki_colombia', 'cnbc_review', 'usgs'], src: 'wiki_colombia' },
  { id: 'nepal', type: 'glacier', title: 'Langtang glacier collapse and Trishuli flood', place: 'Rasuwa, Nepal and Gyirong, Tibet', date: '2026-08-26', lat: 28.27, lon: 85.37, iso3: 'NPL',
    box: [27.5, 84.5, 28.9, 86.4], imgFrom: '2026-08-12', imgTo: '2026-10-25',
    what: 'A rock-ice avalanche from the Lirung massif became a debris flow that destroyed a border crossing in seven minutes and swept 72 km down the Trishuli River.',
    deaths: 1498, deathsNote: '1,455 in Nepal and 43 in Tibet; 5,800 more missing', damageUsd: 1.8e9, damageNote: 'damage in Nepal (रू 277.79 bn), Government of Nepal',
    figures: [['1,498', 'deaths, with 5,804 missing'], ['US$1.8 billion', 'damage in Nepal'], ['US$4.78 billion', 'estimated rebuilding cost'], ['7 minutes', 'from collapse to the border crossing']],
    natural: ['Steep, rising terrain; the same massif failed in 2015'],
    human: ['Warming weakens the permafrost that holds high rock and ice together', 'Hydropower sites, a customs yard and a trade route on the valley floor'],
    research: ['conversation_nepal', 'earthsky_nepal', 'wiki_nepal'], src: 'wiki_nepal' },
];

export const TYPE_META = {
  cyclone: { label: 'Cyclone', color: '#48d6ff' },
  earthquake: { label: 'Earthquake', color: '#ffb347' },
  wildfire: { label: 'Wildfire', color: '#ff5f4d' },
  glacier: { label: 'Glacier collapse', color: '#c8a6ff' },
};

export const YEAR_CONTEXT = [
  { v: 'US$112 bn', label: 'global economic losses, first half of 2026', note: 'Munich Re — below the 10-year average', src: 'munichre' },
  { v: 'US$42–44 bn', label: 'insured losses, first half of 2026', note: 'Swiss Re and Munich Re — the lowest first half since 2020', src: 'swissre' },
  { v: '58%', label: 'of insured losses normally fall in the second half', note: 'Swiss Re — a quiet first half is not a quiet year', src: 'swissre' },
];

// ---------- Reading the signals ----------
export const SIGNAL_CASES = [
  { id: 'ditwah-rain', title: 'Rain before the landslides', place: 'Central Sri Lanka', lat: 7.3, lon: 80.6, start: '20251101', end: '20251210', param: 'PRECTOTCORR', event: '20251128', eventLabel: 'Ditwah landfall', unit: 'mm/day',
    read: 'Rain falling on ground that is already saturated is what turns a storm into landslides. Watch the days before landfall, not just the peak.' },
  { id: 'senyar-rain', title: 'A cyclone where none should form', place: 'Northern Sumatra', lat: 1.74, lon: 98.78, start: '20251101', end: '20251210', param: 'PRECTOTCORR', event: '20251126', eventLabel: 'Senyar landfall', unit: 'mm/day',
    read: 'Compare each day with what is normal for the month. A multi-day run far above normal is the flood signal.' },
  { id: 'france-heat', title: 'Heat building before the fires', place: 'Gironde, France', lat: 44.6, lon: -0.8, start: '20260601', end: '20260815', param: 'T2M_MAX', event: '20260720', eventLabel: 'Record burned area', unit: '°C',
    read: 'Fire weather is cumulative: weeks of hotter-than-normal afternoons dry out the fuel long before anything ignites.' },
  { id: 'nepal-rain', title: 'The flood that rain did not cause', place: 'Langtang, Nepal', lat: 28.26, lon: 85.5, start: '20260715', end: '20260905', param: 'PRECTOTCORR', event: '20260826', eventLabel: 'Glacier collapse', unit: 'mm/day',
    read: 'An honest negative. Rainfall here was unremarkable for the monsoon, and none was reported on the morning itself. The warning sign was in the ice — see ground motion below.' },
];

export const SIGNAL_NOTES = [
  { title: 'Ground motion', src: 'wiki_nepal', icon: '↯',
    text: 'From January to mid-August 2026 the glacier north of Langtang Lirung moved about 10 mm a month, then accelerated in the weeks before it failed. Radar interferometry — what NISAR\'s GUNW product measures — is how slow motion like this is detected from orbit.',
    link: { href: '/?story=kumamoto-ground', label: 'See real NISAR ground-motion data (Kumamoto)' } },
  { title: 'Glacial lake growth', src: 'shugar2020', icon: '◍',
    text: 'Between 1990 and 2018 the volume of the world\'s glacial lakes grew by about 48%, to 156.5 km³, as glaciers retreated (Shugar et al., Landsat record). More stored water above valleys means more potential outburst floods.' },
  { title: 'Radar sees through the monsoon', src: 'hls', icon: '☁',
    text: 'Two days before the Langtang collapse, the optical satellite view was mostly cloud. NISAR\'s L-band radar passed on 19 and 31 August and imaged the ground both times — which is why SAR is the instrument for monsoon disasters.' },
];

// ---------- The forecast: drivers and preparedness ----------
export const HAZARD_GUIDE = {
  wet: { title: 'Flood and landslide', natural: ['Intense or prolonged rain, cyclones, monsoon bursts', 'Steep slopes and saturated soils'],
    human: ['A warmer atmosphere holds about 7% more water vapour per °C, intensifying heavy rain (IPCC AR6)', 'Deforestation, paved surfaces and building on floodplains'],
    act: ['Know your evacuation route and the nearest high ground', 'Keep documents, water, medicine and a charged phone ready during the rainy season', 'Never walk or drive through moving floodwater', 'Follow official alerts; leave early when told to'] },
  dry: { title: 'Drought', natural: ['Natural swings such as El Niño and La Niña', 'Persistent high-pressure systems'],
    human: ['Warming increases evaporation, deepening droughts when rain fails', 'Over-extraction of rivers and groundwater'],
    act: ['Store and conserve water early; fix leaks', 'Protect crops and livestock with drought-tolerant planning', 'Watch for fire bans — drought raises wildfire risk'] },
  heat: { title: 'Heatwave and fire weather', natural: ['Stalled high-pressure "heat domes"', 'Dry soils that amplify heating'],
    human: ['Human-caused warming has made heatwaves more frequent and more intense (IPCC AR6)', 'Urban heat islands; lack of shade and cooling'],
    act: ['Check on older neighbours and young children', 'Drink water often; avoid midday exertion', 'Know the signs of heat stroke and where cooling centres are'] },
  seismic: { title: 'Earthquake', natural: ['Movement on plate boundaries and faults — entirely natural, and not predictable'],
    human: ['Almost all earthquake deaths come from collapsing buildings: codes and enforcement decide the toll', 'Building on soft soils and steep slopes'],
    act: ['Secure heavy furniture; identify safe spots in each room', 'Practise "drop, cover and hold on"', 'Keep a household kit and agree a meeting point', 'After shaking stops, expect aftershocks and move away from damaged buildings'] },
  soil: { title: 'Saturated ground', natural: ['Days of rain with no time to drain', 'Snowmelt and high water tables'],
    human: ['Paved surfaces and blocked drains send water to the lowest ground', 'Cut slopes along roads and terraces fail first when soaked'],
    act: ['Treat any further heavy rain as a flood and landslide warning', 'Watch slopes above homes and roads for cracks, tilting trees or muddy springs', 'Clear drains and keep valuables off the floor'] },
  fire: { title: 'Wildfire', natural: ['Lightning, heat, drought and wind'],
    human: ['Most ignitions are caused by people', 'Climate change lengthens fire seasons; homes are built into flammable landscapes'],
    act: ['Clear dry vegetation around buildings', 'Prepare a go-bag and two ways out', 'Leave early — smoke and fast fire runs kill', 'Protect your lungs: stay indoors or use a fitted mask in smoke'] },
  events: { title: 'Declared events nearby', natural: ['Depends on the event — open the links for details'],
    human: ['Exposure and preparedness decide whether a hazard becomes a disaster'],
    act: ['Follow your national disaster agency and local authorities', 'Sign up for official alerts where available'] },
};
