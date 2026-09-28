// Mission metadata for Earth-observation satellites, matched against the real
// CelesTrak object names. Positions always come from real TLEs; this table only
// adds descriptive facts (operator, instrument, what the sensor can observe).
//
// Claim levels (strongest supported claim wins, see WHO IS WATCHING):
//   IN_ORBIT            a TLE exists and we can propagate it
//   CAPABLE             the instrument type can observe this phenomenon
//   OBSERVED            a real acquisition over this place is in an archive
//   PROVIDED_EVIDENCE   that acquisition is used as evidence in this story
export const CLAIM = Object.freeze({
  IN_ORBIT: 'IN ORBIT',
  CAPABLE: 'CAPABLE OF OBSERVING',
  OBSERVED: 'OBSERVED THIS LOCATION',
  PROVIDED_EVIDENCE: 'PROVIDED THIS EVIDENCE',
});

export const MISSIONS = [
  {
    match: /^NISAR\b/, key: 'nisar', name: 'NISAR', operator: 'NASA × ISRO', norad: 65053,
    instrument: 'L-band SAR (NASA) + S-band SAR (ISRO)', sensor: 'radar',
    capable: ['water', 'ground_motion', 'agriculture', 'forest', 'ice'],
    blurb: 'NASA-ISRO SAR mission. Maps nearly all of Earth’s land and ice every 12 days, day or night, through cloud.',
    link: 'https://science.nasa.gov/mission/nisar/',
  },
  { match: /^SENTINEL-1/, key: 's1', operator: 'ESA / EU Copernicus', instrument: 'C-band SAR', sensor: 'radar', capable: ['water', 'ground_motion', 'agriculture', 'forest', 'ice'], link: 'https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-1' },
  { match: /^SENTINEL-2/, key: 's2', operator: 'ESA / EU Copernicus', instrument: 'MultiSpectral Instrument (optical)', sensor: 'optical', capable: ['water', 'agriculture', 'forest', 'ice'], link: 'https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2' },
  { match: /^SENTINEL-3/, key: 's3', operator: 'ESA / EUMETSAT', instrument: 'OLCI / SLSTR / altimeter', sensor: 'optical', capable: ['water', 'ice'], link: 'https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-3' },
  { match: /^LANDSAT [89]/, key: 'landsat', operator: 'NASA / USGS', instrument: 'OLI / TIRS (optical + thermal)', sensor: 'optical', capable: ['water', 'agriculture', 'forest', 'ice'], link: 'https://landsat.gsfc.nasa.gov/' },
  { match: /^(TERRA|AQUA)$/, key: 'modis', operator: 'NASA', instrument: 'MODIS (optical)', sensor: 'optical', capable: ['water', 'agriculture', 'forest', 'ice'], link: 'https://modis.gsfc.nasa.gov/' },
  { match: /^(SUOMI NPP|NOAA 2[01]|NOAA-2[01])/, key: 'viirs', operator: 'NASA / NOAA', instrument: 'VIIRS (optical)', sensor: 'optical', capable: ['water', 'ice'], link: 'https://www.earthdata.nasa.gov/data/instruments/viirs' },
  { match: /^SMAP$/, key: 'smap', operator: 'NASA', instrument: 'L-band radiometer', sensor: 'radiometer', capable: ['water', 'agriculture'], link: 'https://smap.jpl.nasa.gov/' },
  { match: /^SWOT$/, key: 'swot', operator: 'NASA / CNES', instrument: 'Ka-band radar interferometer', sensor: 'radar', capable: ['water'], link: 'https://swot.jpl.nasa.gov/' },
  { match: /^ALOS-[24]/, key: 'alos', operator: 'JAXA', instrument: 'L-band SAR (PALSAR)', sensor: 'radar', capable: ['water', 'ground_motion', 'forest', 'ice'], link: 'https://global.jaxa.jp/projects/sat/alos4/' },
  { match: /^RADARSAT/, key: 'radarsat', operator: 'CSA', instrument: 'C-band SAR', sensor: 'radar', capable: ['water', 'ground_motion', 'ice'], link: 'https://www.asc-csa.gc.ca/eng/satellites/radarsat/' },
  { match: /^ICESAT-2/, key: 'icesat2', operator: 'NASA', instrument: 'Laser altimeter (ATLAS)', sensor: 'lidar', capable: ['ice'], link: 'https://icesat-2.gsfc.nasa.gov/' },
  { match: /^ISS \(ZARYA\)/, key: 'iss', operator: 'International', instrument: 'Crewed station', sensor: 'other', capable: [], link: 'https://www.nasa.gov/international-space-station/' },
];

export function missionFor(name) {
  return MISSIONS.find((m) => m.match.test(String(name).trim())) || null;
}
