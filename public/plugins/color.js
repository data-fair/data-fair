import Vue from 'vue'
import tinycolor from 'tinycolor2'

const readableColor = (color, dark) => {
  if (!color) return
  if (dark) {
    const c = tinycolor(color)
    const lightness = c.getLuminance()
    if (lightness > 0.3) return color.toString()
    return c.lighten((0.3 - lightness) * 100).toString()
  } else {
    const c = tinycolor(color)
    const darkness = 1 - c.getLuminance()
    if (darkness > 0.7) return c.toString()
    return c.darken((0.7 - darkness) * 100).toString()
  }
}

Vue.prototype.$color = tinycolor
Vue.prototype.$readableColor = readableColor
