import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { vuetifySessionOptions } from '@data-fair/lib-vuetify'
import '@data-fair/lib-vuetify/style/global.scss'
import { createReactiveSearchParams } from '@data-fair/lib-vue/reactive-search-params.js'
import { createLocaleDayjs } from '@data-fair/lib-vue/locale-dayjs.js'
import { createSession } from '@data-fair/lib-vue/session.js'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { createI18n } from 'vue-i18n'
import { createHead } from '@unhead/vue'
import App from './App.vue'
import dFrameContent from '@data-fair/frame/lib/vue-router/d-frame-content.js'
import debugModule from 'debug'
import DOMPurify from 'dompurify'

const debug = debugModule('df:main');

(async function () {
  debug('Starting data-fair app')
  const router = createRouter({ history: createWebHistory($sitePath + '/data-fair/embed/'), routes })
  dFrameContent(router)
  const reactiveSearchParams = createReactiveSearchParams(router)
  const session = await createSession({ directoryUrl: $sitePath + '/simple-directory' })
  debug('Session created', session.state)
  const localeDayjs = createLocaleDayjs(session.state.lang)
  const uiNotif = createUiNotif()
  const vuetify = createVuetify({
    ...vuetifySessionOptions(session, $cspNonce),
    icons: { defaultSet: 'mdi', aliases, sets: { mdi, } }
  })
  if (vuetify.defaults.value) {
    vuetify.defaults.value.VjsfTabs = { VWindowsItem: { eager: true } }
    vuetify.defaults.value.VColorPicker = { mode: 'hex', modes: ['hex', 'rgb', 'hsl'] }
  }
  const i18n = createI18n({ locale: session.state.lang })
  const head = createHead()

  const app = createApp(App)
    .use(router)
    .use(reactiveSearchParams)
    .use(session)
    .use(localeDayjs)
    .use(uiNotif)
    .use(vuetify)
    .use(i18n)
    .use(head)

  await router.isReady()
  debug('Router is ready')

  const vSafeHtml = {
    beforeMount (el: HTMLElement, binding: any) {
      el.innerHTML = DOMPurify.sanitize(binding.value)
    },
    updated (el: HTMLElement, binding: any) {
      el.innerHTML = DOMPurify.sanitize(binding.value)
    }
  }

  app.directive('safe-html', vSafeHtml)
  app.mount('#app')
})()
