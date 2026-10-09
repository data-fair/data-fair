// GDAL drivers per file format
const geographicalDrivers: Record<string, string[]> = {
  'application/vnd.google-earth.kml+xml': ['KML', 'LIBKML'],
  'application/vnd.google-earth.kmz': ['LIBKML', 'KML'],
  'application/gpx+xml': ['GPX'],
  'application/geopackage+sqlite3': ['GPKG']
}

/**
 * The -if options to pass to ogr2ogr for an input, throws if the input type has no known driver
 */
export const getOgrInputOptions = (input: { shapefile?: string, mapinfo?: string, mimetype: string }): string[] => {
  let drivers: string[] | undefined
  if (input.shapefile) drivers = ['ESRI Shapefile']
  else if (input.mapinfo) drivers = ['MapInfo File']
  else drivers = geographicalDrivers[input.mimetype]
  if (!drivers) throw new Error(`no GDAL driver allowed for the type ${input.mimetype}`)
  return drivers.flatMap(driver => ['-if', driver])
}

// Run GDAL in a controlled environment
const ogrEnvKeys = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'LD_LIBRARY_PATH']
const ogrEnvPrefixes = ['GDAL_', 'CPL_', 'OGR_', 'PROJ_']

export const getOgrEnv = (env: NodeJS.ProcessEnv = process.env): Record<string, string> => {
  const ogrEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (ogrEnvKeys.includes(key) || ogrEnvPrefixes.some(prefix => key.startsWith(prefix))) ogrEnv[key] = value
  }
  return ogrEnv
}
