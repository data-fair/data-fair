import path from 'node:path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { unheadVueComposablesImports } from '@unhead/vue'
// import webfontDownload from 'vite-plugin-webfont-dl'
import Vuetify from 'vite-plugin-vuetify'
import microTemplate from '@data-fair/lib-utils/micro-template.js'
import { autoImports, settingsPath } from '@data-fair/lib-vuetify/vite.js'
import { commonjsDeps } from '@koumoul/vjsf/utils/build.js'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/data-fair/embed',
  optimizeDeps: { include: [...commonjsDeps, 'easymde'] },
  build: {
    rollupOptions: {
      output: {
        experimentalMinChunkSize: 2000
      }
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src/')
    },
  },
  html: {
    cspNonce: '{CSP_NONCE}'
  },
  plugins: [
    VueRouter({
      dts: './dts/typed-router.d.ts',
      // exclude: process.env.NODE_ENV === 'development' ? [] : ['src/pages/dev.vue']
    }),
    Vue({ template: { compilerOptions: { isCustomElement: (tag) => ['d-frame'].includes(tag) } } }),
    VueI18nPlugin({ strictMessage: false }),
    Vuetify({ styles: { configFile: settingsPath } }),
    AutoImport({
      dts: './dts/auto-imports.d.ts',
      vueTemplate: true,
      imports: [
        ...(autoImports as any),
        unheadVueComposablesImports,
        {
          '~/context': ['$uiConfig', '$sitePath', '$cspNonce', '$siteUrl', '$sdUrl', '$apiPath', '$fetch', '$wsUrl']
        }
      ],
      dirs: [
        'src/utils',
        'src/composables'
      ]
    }),
    Components({ dts: './dts/components.d.ts' }),
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
      if (hostType === 'html') return '{SITE_PATH}/data-fair/embed/' + filename
      return { relative: true }
    }
  },
  server: { hmr: { port: 7200 } }
})
