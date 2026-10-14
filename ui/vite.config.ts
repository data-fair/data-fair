import path from 'node:path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
// import webfontDownload from 'vite-plugin-webfont-dl'
import Vuetify from 'vite-plugin-vuetify'
import microTemplate from '@data-fair/lib-utils/micro-template.js'
import { autoImports, settingsPath } from '@data-fair/lib-vuetify/vite.js'
import { commonjsDeps } from '@koumoul/vjsf/utils/build.js'

// ports come from the .env written by df-dev (see dev/dev.json), checked so a missing variable never becomes NaN
const envPort = (name: string) => {
  const port = Number(process.env[name])
  if (!Number.isInteger(port) || port <= 0) throw new Error(`missing or invalid ${name}, run "npx --no df-dev setup"`)
  return port
}

// https://vitejs.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  base: '/data-fair',
  // maplibre 6 ships its worker as an ES module and starts it with `new Worker(url, { type: 'module' })`.
  // Vite's default worker format is iife, which in dev serves that module source as a classic script
  // ("Cannot use import statement outside a module", and no vector tiles at all).
  worker: { format: 'es' },
  optimizeDeps: {
    // prevent reloading when auto-discovering deps to optimize, everything must be solved before hand
    noDiscovery: true,
    include: [
      ...commonjsDeps,
      'easymde',
      'vuedraggable',
      'fast-deep-equal',
      'debounce',
      'maplibre-gl',
      'http-link-header',
      'streamsaver',
      'slugify',
      'ajv/dist/2020.js',
      'ajv/dist/runtime/ucs2length.js',
      'ajv-i18n/localize/en/index.js',
      'ajv-i18n/localize/fr/index.js',
      'dayjs',
      'dayjs/plugin/customParseFormat.js',
      'dayjs/plugin/timezone.js',
      'dayjs/plugin/utc.js',
      'md5'
    ]
  },
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, 'src/'),
      '@data-fair/lib-vuetify/navigation-right.vue': path.resolve(import.meta.dirname, 'src/components/df-local/navigation-right-local.vue'),
      '@data-fair/lib-vue/edit-fetch.js': path.resolve(import.meta.dirname, 'src/composables/df-local/edit-fetch-local.ts'),
    },
  },
  html: {
    cspNonce: '{CSP_NONCE}'
  },
  plugins: [
    VueRouter({
      dts: './dts/route-map.d.ts',
      // dev pages are never bundled; the vite command is reliable where an inherited NODE_ENV is not
      exclude: command === 'build' ? ['src/pages/dev.vue', 'src/pages/dev/**'] : []
    }),
    Vue({ template: { compilerOptions: { isCustomElement: (tag) => ['d-frame'].includes(tag) } } }),
    VueI18nPlugin({ strictMessage: false }),
    Vuetify({ styles: { configFile: settingsPath } }),
    AutoImport({
      dts: './dts/auto-imports.d.ts',
      vueTemplate: true,
      imports: [
        ...(autoImports as any),
        {
          '~/context': ['$uiConfig', '$sitePath', '$cspNonce', '$siteUrl', '$sdUrl', '$apiPath', '$fetch', '$wsUrl'],
          'truncate-middle': [['default', '$truncate']],
          '@data-fair/lib-vue/format/bytes.js': ['formatBytes'],
        }
      ],
      dirs: [
        'src/utils',
        'src/composables/**',
        // standalone logic files (without Vue/runtime deps) are excluded to avoid duplicate auto-imports,
        // they are re-exported by their parent composable and only imported directly in unit tests
        '!src/composables/**/*-logic*'
      ]
    }),
    Components({
      dts: './dts/components.d.ts',
      resolvers: [
        // resolve <df-*> components from @data-fair/lib-vuetify
        (componentName) => {
          if (componentName.startsWith('Df')) {
            const kebab = componentName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
            const file = kebab.replace(/^df-/, '')
            return { name: 'default', from: `@data-fair/lib-vuetify/${file}.vue` }
          }
        }
      ]
    }),
    {
      name: 'inject-site-context',
      async transformIndexHtml (html) {
        // in production this injection will be performed by an express middleware
        if (process.env.NODE_ENV !== 'development') return html
        const { uiConfigPath } = (await import('@data-fair/lib-express')).prepareUiConfig((await import('../api/src/ui-config.ts')).uiConfig)
        return microTemplate(html, {
          SITE_PATH: '',
          UI_CONFIG_PATH: uiConfigPath,
          THEME_CSS_HASH: '',
          PUBLIC_SITE_INFO_HASH: ''
        })
      }
    }
  ],
  experimental: {
    renderBuiltUrl (filename, { hostType }) {
      if (hostType === 'html') return '{SITE_PATH}/data-fair/' + filename
      return { relative: true }
    }
  },
  server: command === 'serve' && !isPreview
    ? { port: envPort('DEV_UI_PORT'), strictPort: true, hmr: { port: envPort('DEV_UI_HMR_PORT') } }
    : undefined
}))
