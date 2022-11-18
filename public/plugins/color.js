import Vue from 'vue'
import tinycolor from 'tinycolor2'

// calculate a variant of a color with radability guaranteed readability
// default background is #FAFAFA = light grey background or #424242 = dark grey text
const contrastColorCache = {}
const readableColor = (color1, darkBg) => {
  if (!color1) return
  const color2 = darkBg ? '#424242' : '#FAFAFA'
  const cacheKey = JSON.stringify([color1, color2])
  if (contrastColorCache[cacheKey]) return contrastColorCache[cacheKey]
  const c = tinycolor(color1)
  while (!tinycolor.isReadable(c, color2, { level: 'AA', size: 'small' })) {
    if (darkBg) {
      c.brighten(1)
    } else {
      c.darken(1)
    }
  }
  contrastColorCache[cacheKey] = c.toString()
  return contrastColorCache[cacheKey]
}

Vue.prototype.$color = tinycolor
Vue.prototype.$readableColor = readableColor
