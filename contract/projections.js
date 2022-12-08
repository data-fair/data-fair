// A subset of cartographic projections supported by data-fair
// based on definitions from https://epsg.io/about

module.exports = [{
  title: 'NTF (Paris) / Lambert zone II',
  code: 'EPSG:27572',
  proj4: '+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs '
}, {
  title: 'RGF93 / Lambert-93 -- France',
  code: 'EPSG:2154',
  proj4: '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs '
}, {
  title: 'RGAF09 / UTM zone 20N',
  code: 'EPSG:5490',
  proj4: '+proj=utm +zone=20 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
}, {
  title: 'WGS 84 / Pseudo-Mercator -- Spherical Mercator, Google Maps, OpenStreetMap, Bing, ArcGIS, ESRI',
  code: 'EPSG:3857',
  proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs'
}, {
  title: 'WGS 84 - WGS84 - World Geodetic System 1984, used in GPS',
  code: 'EPSG:4326',
  proj4: '+proj=longlat +datum=WGS84 +no_defs +type=crs'
}, {
  title: 'WGS 84 / UTM zone 20N',
  code: 'EPSG:32620',
  proj4: '+proj=utm +zone=20 +datum=WGS84 +units=m +no_defs +type=crs'
}]
