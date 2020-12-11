import Vue from 'vue'
import Router from 'vue-router'
import { normalizeURL } from '@nuxt/ufo'
import { interopDefault } from './utils'
import scrollBehavior from './router.scrollBehavior.js'

const _6663cd76 = () => interopDefault(import('../doc/pages/index.vue' /* webpackChunkName: "pages/index" */))
const _3bd807cb = () => interopDefault(import('../doc/pages/functional-presentation/index.vue' /* webpackChunkName: "pages/functional-presentation/index" */))
const _1ab5e602 = () => interopDefault(import('../doc/pages/install/index.vue' /* webpackChunkName: "pages/install/index" */))
const _37c8f2b7 = () => interopDefault(import('../doc/pages/interoperate/index.vue' /* webpackChunkName: "pages/interoperate/index" */))
const _1b4f5f30 = () => interopDefault(import('../doc/pages/full/functional-presentation.vue' /* webpackChunkName: "pages/full/functional-presentation" */))
const _00827ab2 = () => interopDefault(import('../doc/pages/full/install.vue' /* webpackChunkName: "pages/full/install" */))
const _f9358768 = () => interopDefault(import('../doc/pages/full/interoperate.vue' /* webpackChunkName: "pages/full/interoperate" */))
const _303d0048 = () => interopDefault(import('../doc/pages/about/_id.vue' /* webpackChunkName: "pages/about/_id" */))
const _10cb80f3 = () => interopDefault(import('../doc/pages/functional-presentation/_id.vue' /* webpackChunkName: "pages/functional-presentation/_id" */))
const _0f2980ea = () => interopDefault(import('../doc/pages/install/_id.vue' /* webpackChunkName: "pages/install/_id" */))
const _b8db9242 = () => interopDefault(import('../doc/pages/interoperate/_id.vue' /* webpackChunkName: "pages/interoperate/_id" */))
const _bb54599e = () => interopDefault(import('../doc/pages/user-guide/_id.vue' /* webpackChunkName: "pages/user-guide/_id" */))

// TODO: remove in Nuxt 3
const emptyFn = () => {}
const originalPush = Router.prototype.push
Router.prototype.push = function push (location, onComplete = emptyFn, onAbort) {
  return originalPush.call(this, location, onComplete, onAbort)
}

Vue.use(Router)

export const routerOptions = {
  mode: 'history',
  base: '/data-fair/',
  linkActiveClass: 'nuxt-link-active',
  linkExactActiveClass: 'nuxt-link-exact-active',
  scrollBehavior,

  routes: [{
    path: "/en",
    component: _6663cd76,
    name: "index___en"
  }, {
    path: "/functional-presentation",
    component: _3bd807cb,
    name: "functional-presentation___fr"
  }, {
    path: "/install",
    component: _1ab5e602,
    name: "install___fr"
  }, {
    path: "/interoperate",
    component: _37c8f2b7,
    name: "interoperate___fr"
  }, {
    path: "/en/functional-presentation",
    component: _3bd807cb,
    name: "functional-presentation___en"
  }, {
    path: "/en/install",
    component: _1ab5e602,
    name: "install___en"
  }, {
    path: "/en/interoperate",
    component: _37c8f2b7,
    name: "interoperate___en"
  }, {
    path: "/full/functional-presentation",
    component: _1b4f5f30,
    name: "full-functional-presentation___fr"
  }, {
    path: "/full/install",
    component: _00827ab2,
    name: "full-install___fr"
  }, {
    path: "/full/interoperate",
    component: _f9358768,
    name: "full-interoperate___fr"
  }, {
    path: "/en/full/functional-presentation",
    component: _1b4f5f30,
    name: "full-functional-presentation___en"
  }, {
    path: "/en/full/install",
    component: _00827ab2,
    name: "full-install___en"
  }, {
    path: "/en/full/interoperate",
    component: _f9358768,
    name: "full-interoperate___en"
  }, {
    path: "/en/about/:id?",
    component: _303d0048,
    name: "about-id___en"
  }, {
    path: "/en/functional-presentation/:id?",
    component: _10cb80f3,
    name: "functional-presentation-id___en"
  }, {
    path: "/en/install/:id",
    component: _0f2980ea,
    name: "install-id___en"
  }, {
    path: "/en/interoperate/:id",
    component: _b8db9242,
    name: "interoperate-id___en"
  }, {
    path: "/en/user-guide/:id?",
    component: _bb54599e,
    name: "user-guide-id___en"
  }, {
    path: "/about/:id?",
    component: _303d0048,
    name: "about-id___fr"
  }, {
    path: "/functional-presentation/:id?",
    component: _10cb80f3,
    name: "functional-presentation-id___fr"
  }, {
    path: "/install/:id",
    component: _0f2980ea,
    name: "install-id___fr"
  }, {
    path: "/interoperate/:id",
    component: _b8db9242,
    name: "interoperate-id___fr"
  }, {
    path: "/user-guide/:id?",
    component: _bb54599e,
    name: "user-guide-id___fr"
  }, {
    path: "/",
    component: _6663cd76,
    name: "index___fr"
  }],

  fallback: false
}

function decodeObj(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key])
    }
  }
}

export function createRouter () {
  const router = new Router(routerOptions)

  const resolve = router.resolve.bind(router)
  router.resolve = (to, current, append) => {
    if (typeof to === 'string') {
      to = normalizeURL(to)
    }
    const r = resolve(to, current, append)
    if (r && r.resolved && r.resolved.query) {
      decodeObj(r.resolved.query)
    }
    return r
  }

  return router
}
