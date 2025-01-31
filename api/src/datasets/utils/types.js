export const archiveTypes = new Set([
  'application/zip' // .zip
  /* 'application/x-7z-compressed', // .7z
  'application/x-bzip', // .bzip
  'application/x-bzip2', // .bzip2
  'application/x-tar', // .tar */
])
export const tabularTypes = new Set([
  'application/vnd.oasis.opendocument.spreadsheet', // ods, fods
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/dbase' // dbf
])
export const geographicalTypes = new Set([
  'application/vnd.google-earth.kml+xml', // kml
  'application/vnd.google-earth.kmz', // kmz
  'application/gpx+xml', // gpx or xml ?
  'application/geopackage+sqlite3' // gpkg
])
export const calendarTypes = new Set(['text/calendar'])
export const csvTypes = [
  'text/csv',
  'text/plain', // txt often contains csv or tsv content
  'text/tab-separated-values' // tsv processed in the same way as csv
]
export const basicTypes = [
  ...csvTypes,
  'application/geo+json'
]
