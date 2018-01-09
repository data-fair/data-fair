
function tile2long(x, z) {
  return (x / Math.pow(2, z) * 360 - 180)
}

function tile2lat(y, z) {
  var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z)
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))))
}

// cf https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_.28JavaScript.2FActionScript.2C_etc..29
exports.xyz2bbox = (x, y, z) => {
  // left ,bottom,right,top
  return [tile2long(x, z), tile2lat(y + 1, z), tile2long(x + 1, z), tile2lat(y, z)]
}
