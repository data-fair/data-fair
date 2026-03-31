import Vue from 'vue'
import Vuex from 'vuex'
import Meta from 'vue-meta'
import ClientOnly from 'vue-client-only'
import NoSsr from 'vue-no-ssr'
import { createRouter } from './router.js'
import NuxtChild from './components/nuxt-child.js'
import NuxtError from '../public/layouts/error.vue'
import Nuxt from './components/nuxt.js'
import App from './App.js'
import { setContext, getLocation, getRouteData, normalizeError } from './utils'
import { createStore } from './store.js'

/* Plugins */

import nuxt_plugin_plugin_4c6e3d14 from 'nuxt_plugin_plugin_4c6e3d14' // Source: ./components/plugin.js (mode: 'all')
import nuxt_plugin_plugin_76743f5a from 'nuxt_plugin_plugin_76743f5a' // Source: ./vuetify/plugin.js (mode: 'all')
import nuxt_plugin_pluginutils_f70c3d5e from 'nuxt_plugin_pluginutils_f70c3d5e' // Source: ./nuxt-i18n/plugin.utils.js (mode: 'all')
import nuxt_plugin_pluginrouting_03875e5c from 'nuxt_plugin_pluginrouting_03875e5c' // Source: ./nuxt-i18n/plugin.routing.js (mode: 'all')
import nuxt_plugin_pluginmain_02d98a93 from 'nuxt_plugin_pluginmain_02d98a93' // Source: ./nuxt-i18n/plugin.main.js (mode: 'all')
import nuxt_plugin_cookieuniversalnuxt_adbf1c5c from 'nuxt_plugin_cookieuniversalnuxt_adbf1c5c' // Source: ./cookie-universal-nuxt.js (mode: 'all')
import nuxt_plugin_axios_71d4662a from 'nuxt_plugin_axios_71d4662a' // Source: ./axios.js (mode: 'all')
import nuxt_plugin_session_54e3aadf from 'nuxt_plugin_session_54e3aadf' // Source: ../public/plugins/session (mode: 'all')
import nuxt_plugin_globalcomponents_21f90eee from 'nuxt_plugin_globalcomponents_21f90eee' // Source: ../public/plugins/global-components (mode: 'all')
import nuxt_plugin_ws_a8b5c61a from 'nuxt_plugin_ws_a8b5c61a' // Source: ../public/plugins/ws (mode: 'client')
import nuxt_plugin_windowsize_0423f787 from 'nuxt_plugin_windowsize_0423f787' // Source: ../public/plugins/window-size (mode: 'client')
import nuxt_plugin_dynamictheme_505f8c44 from 'nuxt_plugin_dynamictheme_505f8c44' // Source: ../public/plugins/dynamic-theme (mode: 'all')
import nuxt_plugin_moment_4ffca6d2 from 'nuxt_plugin_moment_4ffca6d2' // Source: ../public/plugins/moment (mode: 'all')
import nuxt_plugin_truncate_62442e3d from 'nuxt_plugin_truncate_62442e3d' // Source: ../public/plugins/truncate (mode: 'all')
import nuxt_plugin_cellvalues_056a67b6 from 'nuxt_plugin_cellvalues_056a67b6' // Source: ../public/plugins/cell-values (mode: 'all')
import nuxt_plugin_filterbytes_410fc32d from 'nuxt_plugin_filterbytes_410fc32d' // Source: ../public/plugins/filter-bytes (mode: 'all')
import nuxt_plugin_logger_536bbfb2 from 'nuxt_plugin_logger_536bbfb2' // Source: ../public/plugins/logger (mode: 'client')
import nuxt_plugin_analytics_2180d58f from 'nuxt_plugin_analytics_2180d58f' // Source: ../public/plugins/analytics (mode: 'client')

// Component: <ClientOnly>
Vue.component(ClientOnly.name, ClientOnly)

// TODO: Remove in Nuxt 3: <NoSsr>
Vue.component(NoSsr.name, {
  ...NoSsr,
  render (h, ctx) {
    if (process.client && !NoSsr._warned) {
      NoSsr._warned = true

      console.warn('<no-ssr> has been deprecated and will be removed in Nuxt 3, please use <client-only> instead')
    }
    return NoSsr.render(h, ctx)
  }
})

// Component: <NuxtChild>
Vue.component(NuxtChild.name, NuxtChild)
Vue.component('NChild', NuxtChild)

// Component NuxtLink is imported in server.js or client.js

// Component: <Nuxt>
Vue.component(Nuxt.name, Nuxt)

Object.defineProperty(Vue.prototype, '$nuxt', {
  get() {
    const globalNuxt = this.$root ? this.$root.$options.$nuxt : null
    if (process.client && !globalNuxt && typeof window !== 'undefined') {
      return window.$nuxt
    }
    return globalNuxt
  },
  configurable: true
})

Vue.use(Meta, {"keyName":"head","attribute":"data-n-head","ssrAttribute":"data-n-head-ssr","tagIDKeyName":"hid"})

const defaultTransition = {"name":"page","mode":"out-in","appear":true,"appearClass":"appear","appearActiveClass":"appear-active","appearToClass":"appear-to"}

const originalRegisterModule = Vuex.Store.prototype.registerModule

function registerModule (path, rawModule, options = {}) {
  const preserveState = process.client && (
    Array.isArray(path)
      ? !!path.reduce((namespacedState, path) => namespacedState && namespacedState[path], this.state)
      : path in this.state
  )
  return originalRegisterModule.call(this, path, rawModule, { preserveState, ...options })
}

async function createApp(ssrContext, config = {}) {
  const store = createStore(ssrContext)
  const router = await createRouter(ssrContext, config, { store })

  // Add this.$router into store actions/mutations
  store.$router = router

  // Create Root instance

  // here we inject the router and store to all child components,
  // making them available everywhere as `this.$router` and `this.$store`.
  const app = {
    head: {"title":"Data Fair","meta":[{"charset":"utf-8"},{"name":"viewport","content":"width=device-width, initial-scale=1"},{"hid":"application","name":"application-name","content":"Data Fair"},{"hid":"description","name":"description","content":"Find, Access, Interoperate, Reuse data on the Web"},{"hid":"robots","name":"robots","content":"noindex"}],"link":[],"style":[],"script":[{"src":"\u002Fsimple-directory\u002Fapi\u002Fsites\u002F_public.js"}]},

    store,
    router,
    nuxt: {
      defaultTransition,
      transitions: [defaultTransition],
      setTransitions (transitions) {
        if (!Array.isArray(transitions)) {
          transitions = [transitions]
        }
        transitions = transitions.map((transition) => {
          if (!transition) {
            transition = defaultTransition
          } else if (typeof transition === 'string') {
            transition = Object.assign({}, defaultTransition, { name: transition })
          } else {
            transition = Object.assign({}, defaultTransition, transition)
          }
          return transition
        })
        this.$options.nuxt.transitions = transitions
        return transitions
      },

      err: null,
      errPageReady: false,
      dateErr: null,
      error (err) {
        err = err || null
        app.context._errored = Boolean(err)
        err = err ? normalizeError(err) : null
        let nuxt = app.nuxt // to work with @vue/composition-api, see https://github.com/nuxt/nuxt.js/issues/6517#issuecomment-573280207
        if (this) {
          nuxt = this.nuxt || this.$options.nuxt
        }
        nuxt.dateErr = Date.now()
        nuxt.err = err
        nuxt.errPageReady = false
        // Used in src/server.js
        if (ssrContext) {
          ssrContext.nuxt.error = err
        }
        return err
      }
    },
    ...App
  }

  // Make app available into store via this.app
  store.app = app

  const next = ssrContext ? ssrContext.next : location => app.router.push(location)
  // Resolve route
  let route
  if (ssrContext) {
    route = router.resolve(ssrContext.url).route
  } else {
    const path = getLocation(router.options.base, router.options.mode)
    route = router.resolve(path).route
  }

  // Set context to app.context
  await setContext(app, {
    store,
    route,
    next,
    error: app.nuxt.error.bind(app),
    payload: ssrContext ? ssrContext.payload : undefined,
    req: ssrContext ? ssrContext.req : undefined,
    res: ssrContext ? ssrContext.res : undefined,
    beforeRenderFns: ssrContext ? ssrContext.beforeRenderFns : undefined,
    beforeSerializeFns: ssrContext ? ssrContext.beforeSerializeFns : undefined,
    ssrContext
  })

  function inject(key, value) {
    if (!key) {
      throw new Error('inject(key, value) has no key provided')
    }
    if (value === undefined) {
      throw new Error(`inject('${key}', value) has no value provided`)
    }

    key = '$' + key
    // Add into app
    app[key] = value
    // Add into context
    if (!app.context[key]) {
      app.context[key] = value
    }

    // Add into store
    store[key] = app[key]

    // Check if plugin not already installed
    const installKey = '__nuxt_' + key + '_installed__'
    if (Vue[installKey]) {
      return
    }
    Vue[installKey] = true
    // Call Vue.use() to install the plugin into vm
    Vue.use(() => {
      if (!Object.prototype.hasOwnProperty.call(Vue.prototype, key)) {
        Object.defineProperty(Vue.prototype, key, {
          get () {
            return this.$root.$options[key]
          }
        })
      }
    })
  }

  // Inject runtime config as $config
  inject('config', config)

  if (process.client) {
    // Replace store state before plugins execution
    if (window.__NUXT__ && window.__NUXT__.state) {
      store.replaceState(window.__NUXT__.state)
    }
  }

  // Add enablePreview(previewData = {}) in context for plugins
  if (process.static && process.client) {
    app.context.enablePreview = function (previewData = {}) {
      app.previewData = Object.assign({}, previewData)
      inject('preview', previewData)
    }
  }
  // Plugin execution

  if (typeof nuxt_plugin_plugin_4c6e3d14 === 'function') {
    await nuxt_plugin_plugin_4c6e3d14(app.context, inject)
  }

  if (typeof nuxt_plugin_plugin_76743f5a === 'function') {
    await nuxt_plugin_plugin_76743f5a(app.context, inject)
  }

  if (typeof nuxt_plugin_pluginutils_f70c3d5e === 'function') {
    await nuxt_plugin_pluginutils_f70c3d5e(app.context, inject)
  }

  if (typeof nuxt_plugin_pluginrouting_03875e5c === 'function') {
    await nuxt_plugin_pluginrouting_03875e5c(app.context, inject)
  }

  if (typeof nuxt_plugin_pluginmain_02d98a93 === 'function') {
    await nuxt_plugin_pluginmain_02d98a93(app.context, inject)
  }

  if (typeof nuxt_plugin_cookieuniversalnuxt_adbf1c5c === 'function') {
    await nuxt_plugin_cookieuniversalnuxt_adbf1c5c(app.context, inject)
  }

  if (typeof nuxt_plugin_axios_71d4662a === 'function') {
    await nuxt_plugin_axios_71d4662a(app.context, inject)
  }

  if (typeof nuxt_plugin_session_54e3aadf === 'function') {
    await nuxt_plugin_session_54e3aadf(app.context, inject)
  }

  if (typeof nuxt_plugin_globalcomponents_21f90eee === 'function') {
    await nuxt_plugin_globalcomponents_21f90eee(app.context, inject)
  }

  if (process.client && typeof nuxt_plugin_ws_a8b5c61a === 'function') {
    await nuxt_plugin_ws_a8b5c61a(app.context, inject)
  }

  if (process.client && typeof nuxt_plugin_windowsize_0423f787 === 'function') {
    await nuxt_plugin_windowsize_0423f787(app.context, inject)
  }

  if (typeof nuxt_plugin_dynamictheme_505f8c44 === 'function') {
    await nuxt_plugin_dynamictheme_505f8c44(app.context, inject)
  }

  if (typeof nuxt_plugin_moment_4ffca6d2 === 'function') {
    await nuxt_plugin_moment_4ffca6d2(app.context, inject)
  }

  if (typeof nuxt_plugin_truncate_62442e3d === 'function') {
    await nuxt_plugin_truncate_62442e3d(app.context, inject)
  }

  if (typeof nuxt_plugin_cellvalues_056a67b6 === 'function') {
    await nuxt_plugin_cellvalues_056a67b6(app.context, inject)
  }

  if (typeof nuxt_plugin_filterbytes_410fc32d === 'function') {
    await nuxt_plugin_filterbytes_410fc32d(app.context, inject)
  }

  if (process.client && typeof nuxt_plugin_logger_536bbfb2 === 'function') {
    await nuxt_plugin_logger_536bbfb2(app.context, inject)
  }

  if (process.client && typeof nuxt_plugin_analytics_2180d58f === 'function') {
    await nuxt_plugin_analytics_2180d58f(app.context, inject)
  }

  // Lock enablePreview in context
  if (process.static && process.client) {
    app.context.enablePreview = function () {
      console.warn('You cannot call enablePreview() outside a plugin.')
    }
  }

  // Wait for async component to be resolved first
  await new Promise((resolve, reject) => {
    // Ignore 404s rather than blindly replacing URL in browser
    if (process.client) {
      const { route } = router.resolve(app.context.route.fullPath)
      if (!route.matched.length) {
        return resolve()
      }
    }
    router.replace(app.context.route.fullPath, resolve, (err) => {
      // https://github.com/vuejs/vue-router/blob/v3.4.3/src/util/errors.js
      if (!err._isRouter) return reject(err)
      if (err.type !== 2 /* NavigationFailureType.redirected */) return resolve()

      // navigated to a different route in router guard
      const unregister = router.afterEach(async (to, from) => {
        if (process.server && ssrContext && ssrContext.url) {
          ssrContext.url = to.fullPath
        }
        app.context.route = await getRouteData(to)
        app.context.params = to.params || {}
        app.context.query = to.query || {}
        unregister()
        resolve()
      })
    })
  })

  return {
    store,
    app,
    router
  }
}

export { createApp, NuxtError }
