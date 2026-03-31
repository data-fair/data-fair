import Vue from 'vue'
import Router from 'vue-router'
import { normalizeURL, decode } from 'ufo'
import { interopDefault } from './utils'
import scrollBehavior from './router.scrollBehavior.js'

const _4f366b16 = () => interopDefault(import('../public/pages/api-doc.vue' /* webpackChunkName: "pages/api-doc" */))
const _8478943c = () => interopDefault(import('../public/pages/applications.vue' /* webpackChunkName: "pages/applications" */))
const _57aac78e = () => interopDefault(import('../public/pages/catalogs.vue' /* webpackChunkName: "pages/catalogs" */))
const _1c969898 = () => interopDefault(import('../public/pages/catalogs/_page.vue' /* webpackChunkName: "pages/catalogs/_page" */))
const _6c8591b7 = () => interopDefault(import('../public/pages/catalogs/_page/_page.vue' /* webpackChunkName: "pages/catalogs/_page/_page" */))
const _2d1210d4 = () => interopDefault(import('../public/pages/catalogs/_page/_page/_page.vue' /* webpackChunkName: "pages/catalogs/_page/_page/_page" */))
const _17963a35 = () => interopDefault(import('../public/pages/catalogs/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/catalogs/_page/_page/_page/_page" */))
const _28bac994 = () => interopDefault(import('../public/pages/catalogs/_page/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/catalogs/_page/_page/_page/_page/_page" */))
const _8f95a98c = () => interopDefault(import('../public/pages/datasets.vue' /* webpackChunkName: "pages/datasets" */))
const _f05f3b5e = () => interopDefault(import('../public/pages/department.vue' /* webpackChunkName: "pages/department" */))
const _b9eedfd0 = () => interopDefault(import('../public/pages/events.vue' /* webpackChunkName: "pages/events" */))
const _307fe937 = () => interopDefault(import('../public/pages/events/_page.vue' /* webpackChunkName: "pages/events/_page" */))
const _099ca1d4 = () => interopDefault(import('../public/pages/events/_page/_page.vue' /* webpackChunkName: "pages/events/_page/_page" */))
const _7d4951b5 = () => interopDefault(import('../public/pages/events/_page/_page/_page.vue' /* webpackChunkName: "pages/events/_page/_page/_page" */))
const _5e9e4114 = () => interopDefault(import('../public/pages/events/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/events/_page/_page/_page/_page" */))
const _f898259a = () => interopDefault(import('../public/pages/events/_page/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/events/_page/_page/_page/_page/_page" */))
const _221af097 = () => interopDefault(import('../public/pages/me.vue' /* webpackChunkName: "pages/me" */))
const _1e4f45d4 = () => interopDefault(import('../public/pages/metrics.vue' /* webpackChunkName: "pages/metrics" */))
const _7b624698 = () => interopDefault(import('../public/pages/new-application.vue' /* webpackChunkName: "pages/new-application" */))
const _0552fddc = () => interopDefault(import('../public/pages/new-dataset.vue' /* webpackChunkName: "pages/new-dataset" */))
const _7e3fe0b9 = () => interopDefault(import('../public/pages/notifications.vue' /* webpackChunkName: "pages/notifications" */))
const _4fa975f2 = () => interopDefault(import('../public/pages/organization.vue' /* webpackChunkName: "pages/organization" */))
const _b74c92d6 = () => interopDefault(import('../public/pages/pages.vue' /* webpackChunkName: "pages/pages" */))
const _32477df4 = () => interopDefault(import('../public/pages/pages/_page.vue' /* webpackChunkName: "pages/pages/_page" */))
const _73f40213 = () => interopDefault(import('../public/pages/pages/_page/_page.vue' /* webpackChunkName: "pages/pages/_page/_page" */))
const _39e29a1c = () => interopDefault(import('../public/pages/pages/_page/_page/_page.vue' /* webpackChunkName: "pages/pages/_page/_page/_page" */))
const _73f30091 = () => interopDefault(import('../public/pages/pages/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/pages/_page/_page/_page/_page" */))
const _36af4a20 = () => interopDefault(import('../public/pages/pages/_page/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/pages/_page/_page/_page/_page/_page" */))
const _773f0898 = () => interopDefault(import('../public/pages/portals.vue' /* webpackChunkName: "pages/portals" */))
const _39cbfc92 = () => interopDefault(import('../public/pages/portals/_page.vue' /* webpackChunkName: "pages/portals/_page" */))
const _4a1130d4 = () => interopDefault(import('../public/pages/portals/_page/_page.vue' /* webpackChunkName: "pages/portals/_page/_page" */))
const _b9faab96 = () => interopDefault(import('../public/pages/portals/_page/_page/_page.vue' /* webpackChunkName: "pages/portals/_page/_page/_page" */))
const _2d133994 = () => interopDefault(import('../public/pages/portals/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/portals/_page/_page/_page/_page" */))
const _27ac85b3 = () => interopDefault(import('../public/pages/portals/_page/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/portals/_page/_page/_page/_page/_page" */))
const _7744645e = () => interopDefault(import('../public/pages/processings.vue' /* webpackChunkName: "pages/processings" */))
const _54943830 = () => interopDefault(import('../public/pages/processings/_page.vue' /* webpackChunkName: "pages/processings/_page" */))
const _5a431f4f = () => interopDefault(import('../public/pages/processings/_page/_page.vue' /* webpackChunkName: "pages/processings/_page/_page" */))
const _0cc9f32e = () => interopDefault(import('../public/pages/processings/_page/_page/_page.vue' /* webpackChunkName: "pages/processings/_page/_page/_page" */))
const _1a3423cd = () => interopDefault(import('../public/pages/processings/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/processings/_page/_page/_page/_page" */))
const _138dbda8 = () => interopDefault(import('../public/pages/processings/_page/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/processings/_page/_page/_page/_page/_page" */))
const _1bbe9516 = () => interopDefault(import('../public/pages/remote-services.vue' /* webpackChunkName: "pages/remote-services" */))
const _573b307e = () => interopDefault(import('../public/pages/remote-services/_id.vue' /* webpackChunkName: "pages/remote-services/_id" */))
const _c19d9704 = () => interopDefault(import('../public/pages/reuses.vue' /* webpackChunkName: "pages/reuses" */))
const _0059291d = () => interopDefault(import('../public/pages/reuses/_page.vue' /* webpackChunkName: "pages/reuses/_page" */))
const _188e2b08 = () => interopDefault(import('../public/pages/reuses/_page/_page.vue' /* webpackChunkName: "pages/reuses/_page/_page" */))
const _50182eca = () => interopDefault(import('../public/pages/reuses/_page/_page/_page.vue' /* webpackChunkName: "pages/reuses/_page/_page/_page" */))
const _014cd90c = () => interopDefault(import('../public/pages/reuses/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/reuses/_page/_page/_page/_page" */))
const _3ee55b19 = () => interopDefault(import('../public/pages/reuses/_page/_page/_page/_page/_page.vue' /* webpackChunkName: "pages/reuses/_page/_page/_page/_page/_page" */))
const _37623862 = () => interopDefault(import('../public/pages/settings.vue' /* webpackChunkName: "pages/settings" */))
const _ebcf794a = () => interopDefault(import('../public/pages/share-dataset.vue' /* webpackChunkName: "pages/share-dataset" */))
const _657f2b8c = () => interopDefault(import('../public/pages/storage.vue' /* webpackChunkName: "pages/storage" */))
const _c4224648 = () => interopDefault(import('../public/pages/subscription.vue' /* webpackChunkName: "pages/subscription" */))
const _553629f3 = () => interopDefault(import('../public/pages/update-dataset.vue' /* webpackChunkName: "pages/update-dataset" */))
const _74d6ffbf = () => interopDefault(import('../public/pages/admin/base-apps.vue' /* webpackChunkName: "pages/admin/base-apps" */))
const _0e20b20c = () => interopDefault(import('../public/pages/admin/catalogs-plugins.vue' /* webpackChunkName: "pages/admin/catalogs-plugins" */))
const _54b712ea = () => interopDefault(import('../public/pages/admin/errors.vue' /* webpackChunkName: "pages/admin/errors" */))
const _2a59c726 = () => interopDefault(import('../public/pages/admin/info.vue' /* webpackChunkName: "pages/admin/info" */))
const _1468a51f = () => interopDefault(import('../public/pages/admin/owners.vue' /* webpackChunkName: "pages/admin/owners" */))
const _6454c0a4 = () => interopDefault(import('../public/pages/admin/processings-plugins.vue' /* webpackChunkName: "pages/admin/processings-plugins" */))
const _3e7db8a3 = () => interopDefault(import('../public/pages/index.vue' /* webpackChunkName: "pages/index" */))
const _6e16594e = () => interopDefault(import('../public/pages/admin-extra/_id.vue' /* webpackChunkName: "pages/admin-extra/_id" */))
const _4cb27a0f = () => interopDefault(import('../public/pages/application/_id/index.vue' /* webpackChunkName: "pages/application/_id/index" */))
const _0b5387b7 = () => interopDefault(import('../public/pages/dataset/_id/index.vue' /* webpackChunkName: "pages/dataset/_id/index" */))
const _6b5f4a0c = () => interopDefault(import('../public/pages/extra/_id.vue' /* webpackChunkName: "pages/extra/_id" */))
const _b97efcfc = () => interopDefault(import('../public/pages/application/_id/api-doc.vue' /* webpackChunkName: "pages/application/_id/api-doc" */))
const _514461d5 = () => interopDefault(import('../public/pages/application/_id/config.vue' /* webpackChunkName: "pages/application/_id/config" */))
const _0e5e2079 = () => interopDefault(import('../public/pages/application/_id/description.vue' /* webpackChunkName: "pages/application/_id/description" */))
const _3dd4c52a = () => interopDefault(import('../public/pages/dataset/_id/api-doc.vue' /* webpackChunkName: "pages/dataset/_id/api-doc" */))
const _0f4f5fbe = () => interopDefault(import('../public/pages/dataset/_id/description.vue' /* webpackChunkName: "pages/dataset/_id/description" */))
const _70eca384 = () => interopDefault(import('../public/pages/dataset/_id/events.vue' /* webpackChunkName: "pages/dataset/_id/events" */))
const _17ac4c64 = () => interopDefault(import('../public/pages/remote-service/_id/api-doc.vue' /* webpackChunkName: "pages/remote-service/_id/api-doc" */))
const _32825176 = () => interopDefault(import('../public/pages/_dev/char-sizes.vue' /* webpackChunkName: "pages/_dev/char-sizes" */))
const _08cfe896 = () => interopDefault(import('../public/pages/_dev/extra.vue' /* webpackChunkName: "pages/_dev/extra" */))
const _1144d38c = () => interopDefault(import('../public/pages/_dev/extra2.vue' /* webpackChunkName: "pages/_dev/extra2" */))
const _1152eb0d = () => interopDefault(import('../public/pages/_dev/extra3.vue' /* webpackChunkName: "pages/_dev/extra3" */))
const _12acbdc0 = () => interopDefault(import('../public/pages/_dev/table-embed.vue' /* webpackChunkName: "pages/_dev/table-embed" */))
const _1c221c44 = () => interopDefault(import('../public/pages/_dev/update-dataset.vue' /* webpackChunkName: "pages/_dev/update-dataset" */))

const emptyFn = () => {}

Vue.use(Router)

export const routerOptions = {
  mode: 'history',
  base: '/data-fair/',
  linkActiveClass: 'nuxt-link-active',
  linkExactActiveClass: 'nuxt-link-exact-active',
  scrollBehavior,

  routes: [{
    path: "/api-doc",
    component: _4f366b16,
    name: "api-doc"
  }, {
    path: "/applications",
    component: _8478943c,
    name: "applications"
  }, {
    path: "/catalogs",
    component: _57aac78e,
    name: "catalogs",
    children: [{
      path: ":page?",
      component: _1c969898,
      name: "catalogs-page",
      children: [{
        path: ":page?",
        component: _6c8591b7,
        name: "catalogs-page-page",
        children: [{
          path: ":page?",
          component: _2d1210d4,
          name: "catalogs-page-page-page",
          children: [{
            path: ":page?",
            component: _17963a35,
            name: "catalogs-page-page-page-page",
            children: [{
              path: ":page?",
              component: _28bac994,
              name: "catalogs-page-page-page-page-page"
            }]
          }]
        }]
      }]
    }]
  }, {
    path: "/datasets",
    component: _8f95a98c,
    name: "datasets"
  }, {
    path: "/department",
    component: _f05f3b5e,
    name: "department"
  }, {
    path: "/events",
    component: _b9eedfd0,
    name: "events",
    children: [{
      path: ":page?",
      component: _307fe937,
      name: "events-page",
      children: [{
        path: ":page?",
        component: _099ca1d4,
        name: "events-page-page",
        children: [{
          path: ":page?",
          component: _7d4951b5,
          name: "events-page-page-page",
          children: [{
            path: ":page?",
            component: _5e9e4114,
            name: "events-page-page-page-page",
            children: [{
              path: ":page?",
              component: _f898259a,
              name: "events-page-page-page-page-page"
            }]
          }]
        }]
      }]
    }]
  }, {
    path: "/me",
    component: _221af097,
    name: "me"
  }, {
    path: "/metrics",
    component: _1e4f45d4,
    name: "metrics"
  }, {
    path: "/new-application",
    component: _7b624698,
    name: "new-application"
  }, {
    path: "/new-dataset",
    component: _0552fddc,
    name: "new-dataset"
  }, {
    path: "/notifications",
    component: _7e3fe0b9,
    name: "notifications"
  }, {
    path: "/organization",
    component: _4fa975f2,
    name: "organization"
  }, {
    path: "/pages",
    component: _b74c92d6,
    name: "pages",
    children: [{
      path: ":page?",
      component: _32477df4,
      name: "pages-page",
      children: [{
        path: ":page?",
        component: _73f40213,
        name: "pages-page-page",
        children: [{
          path: ":page?",
          component: _39e29a1c,
          name: "pages-page-page-page",
          children: [{
            path: ":page?",
            component: _73f30091,
            name: "pages-page-page-page-page",
            children: [{
              path: ":page?",
              component: _36af4a20,
              name: "pages-page-page-page-page-page"
            }]
          }]
        }]
      }]
    }]
  }, {
    path: "/portals",
    component: _773f0898,
    name: "portals",
    children: [{
      path: ":page?",
      component: _39cbfc92,
      name: "portals-page",
      children: [{
        path: ":page?",
        component: _4a1130d4,
        name: "portals-page-page",
        children: [{
          path: ":page?",
          component: _b9faab96,
          name: "portals-page-page-page",
          children: [{
            path: ":page?",
            component: _2d133994,
            name: "portals-page-page-page-page",
            children: [{
              path: ":page?",
              component: _27ac85b3,
              name: "portals-page-page-page-page-page"
            }]
          }]
        }]
      }]
    }]
  }, {
    path: "/processings",
    component: _7744645e,
    name: "processings",
    children: [{
      path: ":page?",
      component: _54943830,
      name: "processings-page",
      children: [{
        path: ":page?",
        component: _5a431f4f,
        name: "processings-page-page",
        children: [{
          path: ":page?",
          component: _0cc9f32e,
          name: "processings-page-page-page",
          children: [{
            path: ":page?",
            component: _1a3423cd,
            name: "processings-page-page-page-page",
            children: [{
              path: ":page?",
              component: _138dbda8,
              name: "processings-page-page-page-page-page"
            }]
          }]
        }]
      }]
    }]
  }, {
    path: "/remote-services",
    component: _1bbe9516,
    name: "remote-services",
    children: [{
      path: ":id?",
      component: _573b307e,
      name: "remote-services-id"
    }]
  }, {
    path: "/reuses",
    component: _c19d9704,
    name: "reuses",
    children: [{
      path: ":page?",
      component: _0059291d,
      name: "reuses-page",
      children: [{
        path: ":page?",
        component: _188e2b08,
        name: "reuses-page-page",
        children: [{
          path: ":page?",
          component: _50182eca,
          name: "reuses-page-page-page",
          children: [{
            path: ":page?",
            component: _014cd90c,
            name: "reuses-page-page-page-page",
            children: [{
              path: ":page?",
              component: _3ee55b19,
              name: "reuses-page-page-page-page-page"
            }]
          }]
        }]
      }]
    }]
  }, {
    path: "/settings",
    component: _37623862,
    name: "settings"
  }, {
    path: "/share-dataset",
    component: _ebcf794a,
    name: "share-dataset"
  }, {
    path: "/storage",
    component: _657f2b8c,
    name: "storage"
  }, {
    path: "/subscription",
    component: _c4224648,
    name: "subscription"
  }, {
    path: "/update-dataset",
    component: _553629f3,
    name: "update-dataset"
  }, {
    path: "/admin/base-apps",
    component: _74d6ffbf,
    name: "admin-base-apps"
  }, {
    path: "/admin/catalogs-plugins",
    component: _0e20b20c,
    name: "admin-catalogs-plugins"
  }, {
    path: "/admin/errors",
    component: _54b712ea,
    name: "admin-errors"
  }, {
    path: "/admin/info",
    component: _2a59c726,
    name: "admin-info"
  }, {
    path: "/admin/owners",
    component: _1468a51f,
    name: "admin-owners"
  }, {
    path: "/admin/processings-plugins",
    component: _6454c0a4,
    name: "admin-processings-plugins"
  }, {
    path: "/",
    component: _3e7db8a3,
    name: "index"
  }, {
    path: "/admin-extra/:id?",
    component: _6e16594e,
    name: "admin-extra-id"
  }, {
    path: "/application/:id",
    component: _4cb27a0f,
    name: "application-id"
  }, {
    path: "/dataset/:id",
    component: _0b5387b7,
    name: "dataset-id"
  }, {
    path: "/extra/:id?",
    component: _6b5f4a0c,
    name: "extra-id"
  }, {
    path: "/application/:id?/api-doc",
    component: _b97efcfc,
    name: "application-id-api-doc"
  }, {
    path: "/application/:id?/config",
    component: _514461d5,
    name: "application-id-config"
  }, {
    path: "/application/:id?/description",
    component: _0e5e2079,
    name: "application-id-description"
  }, {
    path: "/dataset/:id?/api-doc",
    component: _3dd4c52a,
    name: "dataset-id-api-doc"
  }, {
    path: "/dataset/:id?/description",
    component: _0f4f5fbe,
    name: "dataset-id-description"
  }, {
    path: "/dataset/:id?/events",
    component: _70eca384,
    name: "dataset-id-events"
  }, {
    path: "/remote-service/:id?/api-doc",
    component: _17ac4c64,
    name: "remote-service-id-api-doc"
  }, {
    path: "/:dev/char-sizes",
    component: _32825176,
    name: "dev-char-sizes"
  }, {
    path: "/:dev/extra",
    component: _08cfe896,
    name: "dev-extra"
  }, {
    path: "/:dev/extra2",
    component: _1144d38c,
    name: "dev-extra2"
  }, {
    path: "/:dev/extra3",
    component: _1152eb0d,
    name: "dev-extra3"
  }, {
    path: "/:dev/table-embed",
    component: _12acbdc0,
    name: "dev-table-embed"
  }, {
    path: "/:dev/update-dataset",
    component: _1c221c44,
    name: "dev-update-dataset"
  }],

  fallback: false
}

export function createRouter (ssrContext, config) {
  const base = (config._app && config._app.basePath) || routerOptions.base
  const router = new Router({ ...routerOptions, base  })

  // TODO: remove in Nuxt 3
  const originalPush = router.push
  router.push = function push (location, onComplete = emptyFn, onAbort) {
    return originalPush.call(this, location, onComplete, onAbort)
  }

  const resolve = router.resolve.bind(router)
  router.resolve = (to, current, append) => {
    if (typeof to === 'string') {
      to = normalizeURL(to)
    }
    return resolve(to, current, append)
  }

  return router
}
