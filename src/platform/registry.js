// Every dataset, API and JPL resource the platform uses: what it is, who
// publishes it, what we use it for and how it is wired in. Shown in Mission
// Control → DATA and kept in step with the README.
// `check` is one of this app's own routes used to show a live status dot.
// (Written with AI assistance — see README → AI disclosure.)
export const REGISTRY = [
  { group: 'NASA JPL', items: [
    { name: 'NISAR L2 GCOV / GUNW', by: 'NASA JPL × ISRO, via ASF DAAC and NASA CMR', use: 'The core: radar before/after and change maps anywhere on land', how: 'ASF Search API + CMR → /api/nisar/*, /api/change/stacks; change computed in the browser', url: 'https://nisar.jpl.nasa.gov/', check: '/api/status' },
    { name: 'OPERA RTC-S1 radar backscatter', by: 'NASA JPL OPERA project', use: 'Radar view of the surface, through cloud', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://www.jpl.nasa.gov/go/opera' },
    { name: 'OPERA DSWx-S1 surface water', by: 'NASA JPL OPERA project', use: 'Flood mapping from radar', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://www.jpl.nasa.gov/go/opera' },
    { name: 'OPERA DIST-ALERT', by: 'NASA JPL OPERA project', use: 'New vegetation loss: clearing, burn scars, storm damage', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://www.jpl.nasa.gov/go/opera' },
    { name: 'SMAP L4 soil moisture', by: 'NASA JPL (SMAP mission)', use: 'Saturated or parched ground before floods, landslides and droughts', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://smap.jpl.nasa.gov/' },
    { name: 'MUR sea surface temperature', by: 'NASA JPL PO.DAAC', use: 'Ocean heat that feeds cyclones', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://podaac.jpl.nasa.gov/MEaSUREs-MUR' },
  ] },
  { group: 'NASA Earthdata', items: [
    { name: 'NASA GIBS / Worldview Snapshots', by: 'NASA ESDIS', use: 'All imagery layers; daily images in the story', how: 'WMTS tiles in the browser; snapshot images by date', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
    { name: 'GPM IMERG rainfall', by: 'NASA GSFC', use: 'Where it is raining now', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://gpm.nasa.gov/data/imerg' },
    { name: 'NASA FIRMS active fires', by: 'NASA LANCE (VIIRS, MODIS)', use: 'About 200,000 fire detections a day; fire signal in the index', how: 'CSV → /api/live/fires, /api/live/fires/density', url: 'https://firms.modaps.eosdis.nasa.gov/', check: '/api/live/fires/density' },
    { name: 'NASA POWER', by: 'NASA Langley', use: 'Rain and heat versus the 2001–2025 normal; signal charts; the index', how: 'REST → /api/signals, /api/risk', url: 'https://power.larc.nasa.gov/', check: '/api/risk?lat=27.72&lon=85.32' },
    { name: 'MODIS flood, land temperature, snow, aerosol', by: 'NASA LANCE / LP DAAC / NSIDC DAAC', use: 'Flood detection, heat, snow store, smoke and dust', how: 'NASA GIBS WMTS tiles → Layers', url: 'https://www.earthdata.nasa.gov/data/instruments/modis' },
    { name: 'Harmonized Landsat Sentinel-2 (HLS)', by: 'NASA LP DAAC', use: 'Nepal before/after images at 30 m', how: 'Worldview Snapshots → saved images', url: 'https://www.earthdata.nasa.gov/data/projects/hls' },
    { name: 'NSIDC Sea Ice Index', by: 'NASA NSIDC DAAC', use: 'Arctic sea ice vital sign and trend', how: 'CSV → /api/vitals', url: 'https://nsidc.org/data/g02135', check: '/api/vitals' },
    { name: 'NASA GISTEMP v4', by: 'NASA GISS', use: 'Global temperature record since 1880', how: 'CSV → /api/vitals (with dated snapshot fallback)', url: 'https://data.giss.nasa.gov/gistemp/' },
  ] },
  { group: 'NASA Open Data and API portal', items: [
    { name: 'Global Landslide Catalog', by: 'NASA GSFC, on data.nasa.gov', use: '11,033 past landslides: history layer and "within 50 km" in the probe', how: 'CSV → tools/build_landslides.mjs → /data/context/landslides.json', url: 'https://data.nasa.gov/dataset/global-landslide-catalog-export' },
    { name: 'EPIC (DSCOVR)', by: 'NASA GSFC, listed on api.nasa.gov', use: 'Daily full-disc photos of Earth', how: 'REST → /api/epic', url: 'https://epic.gsfc.nasa.gov/', check: '/api/epic' },
    { name: 'EONET v3', by: 'NASA GSFC, listed on api.nasa.gov', use: 'Open natural events worldwide', how: 'REST → /api/live/events', url: 'https://eonet.gsfc.nasa.gov/', check: '/api/live/events' },
  ] },
  { group: 'NASA SEDAC — hazard and exposure (catalogued on data.nasa.gov)', items: [
    { name: 'Gridded Population of the World v4, 2020', by: 'NASA SEDAC / CIESIN', use: 'Who is exposed: population under every hazard layer and in The Mission\'s forecast act', how: 'NASA GIBS WMTS tiles → Layers, probe and event context', url: 'https://data.nasa.gov/dataset/?q=Gridded+Population+of+the+World+Version+4' },
    { name: 'Natural Disaster Hotspots: landslide, flood, cyclone, drought, volcano', by: 'NASA SEDAC / CIESIN, World Bank', use: 'Long-term hazard frequency and mortality-risk maps beside today\'s live signals', how: 'NASA GIBS WMTS tiles → Layers, probe and event context', url: 'https://data.nasa.gov/dataset/?q=Natural+Disaster+Hotspots' },
    { name: 'Human Built-up and Settlement Extent (HBASE)', by: 'NASA SEDAC, from Landsat', use: 'What is in harm\'s way around earthquakes', how: 'NASA GIBS WMTS tiles → Layers, earthquake event context', url: 'https://data.nasa.gov/dataset/?q=Human+Built-up+And+Settlement+Extent' },
  ] },
  { group: 'NASA references — linked for depth', items: [
    { ref: true, name: 'LHASA Global Landslide Nowcast', by: 'NASA GSFC, on data.nasa.gov', use: 'NASA\'s own landslide nowcast, the model behind our simpler rain signal', how: 'linked from cyclone and glacier events; needs an Earthdata login to load', url: 'https://data.nasa.gov/dataset/?q=landslide+nowcast' },
    { ref: true, name: 'High Mountain Asia Glacial Lake Inventory', by: 'NASA NSIDC DAAC, on data.nasa.gov', use: 'The glacial lakes above Himalayan valleys', how: 'linked from the Nepal event; needs an Earthdata login to load', url: 'https://data.nasa.gov/dataset/?q=glacial+lake+inventory' },
    { ref: true, name: 'ARIA damage and displacement maps', by: 'NASA JPL / Caltech', use: 'Radar damage-proxy maps after earthquakes — the JPL method closest to NISAR change detection', how: 'linked from every earthquake event', url: 'https://aria.jpl.nasa.gov/' },
    { ref: true, name: 'NASA Disasters Mapping Portal', by: 'NASA Disasters Program, on data.nasa.gov', use: 'NASA\'s event-by-event disaster map products', how: 'linked from every event', url: 'https://data.nasa.gov/dataset/nasa-disasters-mapping-portal' },
    { ref: true, name: 'NISAR orbit ephemeris and observation plan', by: 'NASA JPL, on data.nasa.gov', use: 'Official NISAR orbit and acquisition-plan products; our orbit display uses public TLEs instead', how: 'linked here; the globe propagates NISAR\'s orbit from CelesTrak TLE 65053', url: 'https://data.nasa.gov/dataset/?q=NISAR' },
  ] },
  { group: 'Other agencies', items: [
    { name: 'USGS earthquake feed', by: 'U.S. Geological Survey', use: 'Earthquakes M 2.5+, alerts, seismic signal', how: 'GeoJSON → /api/live/quakes', url: 'https://earthquake.usgs.gov/', check: '/api/live/quakes' },
    { name: 'GDACS', by: 'European Commission JRC / UN OCHA', use: 'Flood, cyclone, volcano and drought alerts', how: 'REST → /api/live/events', url: 'https://www.gdacs.org/' },
    { name: 'Open-Meteo forecast', by: 'Open-Meteo (NOAA GFS, ECMWF models)', use: '7-day rain, temperature and wind outlook — not a NASA product', how: 'REST → /api/outlook', url: 'https://open-meteo.com/', check: '/api/outlook?lat=27.72&lon=85.32' },
    { name: 'GloFAS river discharge forecast', by: 'Copernicus Emergency Management Service, via Open-Meteo', use: '7-day river flow outlook — not a NASA product', how: 'REST → /api/outlook', url: 'https://open-meteo.com/en/docs/flood-api' },
    { name: 'NOAA Mauna Loa CO₂ and satellite altimetry', by: 'NOAA GML and NOAA LSA', use: 'CO₂ and sea-level vital signs', how: 'CSV → /api/vitals', url: 'https://gml.noaa.gov/ccgg/trends/' },
    { name: 'CelesTrak', by: 'CelesTrak', use: 'Orbits of about 300 Earth-observing satellites', how: 'TLE → /api/satellites', url: 'https://celestrak.org/' },
    { name: 'World Bank Open Data', by: 'World Bank', use: 'GDP and population for the impact calculator', how: 'REST → /api/economy/:iso3', url: 'https://data.worldbank.org/' },
    { name: 'Photon / OpenStreetMap', by: 'komoot, OSM contributors', use: 'Place search', how: 'REST → /api/locations/search', url: 'https://photon.komoot.io/' },
  ] },
];
