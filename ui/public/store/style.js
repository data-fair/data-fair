import tinycolor from 'tinycolor2'

const isDark = (color) => tinycolor(color).getLuminance() < 0.4

// calculate a variant of a color with guaranteed readability
// default background is #FAFAFA the light grey background
const contrastColorCache = {}
const contrastColor = (color1, color2 = '#FAFAFA', color3) => {
  if (!color1) return
  const cacheKey = JSON.stringify([color1, color2, color3])
  if (contrastColorCache[cacheKey]) return contrastColorCache[cacheKey]
  const c = tinycolor(color1)
  const dark = isDark(color2)
  while (!tinycolor.isReadable(c, color2, { level: 'AA', size: 'small' }) || !tinycolor.isReadable(c, color3 || color2, { level: 'AA', size: 'small' })) {
    if (dark) {
      c.brighten(1)
    } else {
      c.darken(1)
    }
  }
  contrastColorCache[cacheKey] = c.toString()
  return contrastColorCache[cacheKey]
}

export default () => ({
  state: {
    queryPrimary: null
  },
  getters: {
    contrastColor () {
      return (color1, color2, color3) => contrastColor(color1, color2, color2)
    },
    primary (state, getters, rootState) {
      if (state.queryPrimary) {
        // ensure the color will provide a readable contrast with white text in buttons
        return contrastColor(state.queryPrimary)
      }
      return rootState.env.theme.colors.primary
    },
    lightPrimary5 (state, getters) {
      return tinycolor(getters.primary).brighten(5).toHexString()
    },
    lightPrimary10 (state, getters) {
      return tinycolor(getters.primary).brighten(10).toHexString()
    },
    darkPrimary5 (state, getters) {
      return tinycolor(getters.primary).darken(5).toHexString()
    },
    darkPrimary10 (state, getters) {
      return tinycolor(getters.primary).darken(10).toHexString()
    },
    darkPrimary20 (state, getters) {
      return tinycolor(getters.primary).darken(20).toHexString()
    },
    lightAccent10 (state, getters, rootState) {
      return tinycolor(rootState.env.theme.colors.accent).brighten(10).toHexString()
    },
    darkAccent10 (state, getters, rootState) {
      return tinycolor(rootState.env.theme.colors.accent).darken(10).toHexString()
    },
    readablePrimaryColor (state, getters, rootState) {
      return contrastColor(getters.primary)
    },
    darkReadablePrimary10 (state, getters, rootState) {
      return tinycolor(getters.readablePrimaryColor).darken(10).toHexString()
    },
    linksStyle (state, getters, rootState) {
      if (!state.queryPrimary) return ''
      return `
      .v-application#app a:not(.v-tab):not(.v-list-item):not(.v-card--link) {
        color: ${getters.readablePrimaryColor};
      }
      .v-application#app a:not(.v-tab):not(.v-list-item):not(.v-card--link):hover {
        color: ${getters.darkReadablePrimary10};
      }
      .v-application#app .area--dark a,
      .v-application#app .area--dark a:not(.v-tab):not(.v-list-item):not(.v-card--link),
      .v-application#app .area--dark a:not(.v-tab):not(.v-list-item):not(.v-card--link):hover,
      .v-application#app .area--dark h3,
      .v-application#app .area--dark span {
        color: white;
      }
      .v-application#app .v-btn:not(.v-btn--outlined).primary,
      .v-application#app .v-btn:not(.v-btn--outlined).secondary,
      .v-application#app .v-btn:not(.v-btn--outlined).accent,
      .v-application#app .v-btn:not(.v-btn--outlined).success,
      .v-application#app .v-btn:not(.v-btn--outlined).error,
      .v-application#app .v-btn:not(.v-btn--outlined).warning,
      .v-application#app .v-btn:not(.v-btn--outlined).info {
        color: white;
      }
      .v-application#app .theme--dark.v-list a {
        color: white;
      }
      .v-application#app .area--light a:not(.v-tab):not(.v-list-item),
      .v-application#app .area--light h3,
      .v-application#app .area--light span,
      .v-application#app .area--light .v-tabs-bar.primary .v-tab--active {
        color: ${getters.readablePrimaryColor}!important;
      }
      .v-application#app .primary--text {
        color: ${getters.readablePrimaryColor}!important;
      }
      .v-application#app .primary-darker--text {
        color: ${getters.darkReadablePrimary10}!important;
      }
        `
    },
    style (state, getters) {
      return (htmlOverflow = 'auto') => `
          html {
          overflow-y: ${htmlOverflow} !important;
          }
          .v-btn.primary.theme--light, .theme--light .primary-gradient {
          background: linear-gradient(90deg, ${getters.primary} 0%, ${getters.darkPrimary10} 100%);
          }
          .v-btn.primary.theme--dark, .theme--dark .primary-gradient {
          background: linear-gradient(90deg, ${getters.darkPrimary10} 0%, ${getters.primary} 100%);
          }
          .v-application.theme--light .v-btn.primary.v-btn--has-bg, .theme--light .primary-gradient {
          border: 1px solid ${getters.darkPrimary10} !important;
          }
          .v-application.theme--dark .v-btn.primary.v-btn--has-bg, .theme--dark .primary-gradient {
          border: 1px solid ${getters.primary} !important;
          }
          .v-application.theme--light .navigation-left {
          border-top: 2px solid ${getters.darkPrimary10} !important;
          border-right: 2px solid ${getters.darkPrimary10} !important;
          }
          .v-application.theme--dark .navigation-left {
          border-top: 2px solid ${getters.primary} !important;
          border-right: 2px solid ${getters.primary} !important;
          }

          ${getters.linksStyle}
        `
    }
  }
})
