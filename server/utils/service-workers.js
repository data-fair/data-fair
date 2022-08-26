// Prepare dynamic service workers configurations for data-fair applications
const config = require('config')
const escapeStringRegexp = require('escape-string-regexp')
const { minify } = require('terser')

const debugServiceWorkers = process.env.DEBUG && process.env.DEBUG.includes('service-workers')

let basePath = escapeStringRegexp(new URL(config.publicUrl).pathname)
if (!basePath.endsWith('/')) basePath += '/'

exports.sw = () => {
  // Use workbox for powerful and easy service workers management
  let sw = `
importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.6.1/workbox-sw.js');`

  // Use workbox debug version only in development
  if (debugServiceWorkers) {
    sw += `
workbox.setConfig({ debug: true });
workbox.core.setLogLevel(workbox.core.LOG_LEVELS.debug);`
  }

  // Activate the service worker as fast as possible
  sw += `
workbox.clientsClaim();
workbox.skipWaiting();`
  // Cache first for base applications source code
  // applications should use hashes in resource names
  for (const dir of config.applicationsDirectories) {
    sw += `
workbox.routing.registerRoute(
  new RegExp('^${escapeStringRegexp(dir)}.*'),
  workbox.strategies.cacheFirst({cacheName: 'data-fair'})
);`
  }

  // Content from proxied remote services is not refreshed as often
  // fast loading using stale version should not be a problem
  sw += `
workbox.routing.registerRoute(
  new RegExp('${basePath}api/v1/remote-services/.*/proxy/.*'),
  workbox.strategies.staleWhileRevalidate({cacheName: 'data-fair'})
);`
  // Cache first for datasets queries that are performed with explicit
  // cache invalidation using finalizedAt=... or updatedAt=... query param
  sw += `
workbox.routing.registerRoute(
  new RegExp('${basePath}api/v1/datasets/.*finalizedAt=.*'),
  workbox.strategies.cacheFirst({cacheName: 'data-fair'})
);`
  sw += `
workbox.routing.registerRoute(
  new RegExp('${basePath}api/v1/datasets/.*updatedAt=.*'),
  workbox.strategies.cacheFirst({cacheName: 'data-fair'})
);`

  // Network first by default for all other calls from data-fair domain
  sw += `
workbox.routing.registerRoute(
  new RegExp('/.*'),
  workbox.strategies.networkFirst({cacheName: 'data-fair'})
);`

  return sw
}

const oldBase = config.publicUrl.endsWith('/') ? config.publicUrl + 'app' : config.publicUrl + '/app/'

// The base is the url without a trailing slash
// and the service worker is not exposed behind a slash
// so that we can accept accessing the application without a trailing slash
const register = `
if ('serviceWorker' in navigator) {
  // unregister the deprecated service workers
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs
      .filter(function(reg) { return reg.scope.indexOf('${oldBase}') === 0; })
      .filter(function(reg) { return reg.scope !== '${oldBase}'; })
      .forEach(function(reg) { reg.unregister(); })
  });
  navigator.serviceWorker.register('${basePath}app-sw.js', { scope: '${basePath}app/' }).then(function(reg) {
    ${debugServiceWorkers ? "console.log('Service worker registration succeeded. Scope is ' + reg.scope);" : ''}
  }).catch(function(error) {
    console.log('Service worker registration failed with ' + error);
  });
};`
let minifiedRegister
exports.register = async () => {
  if (debugServiceWorkers) return register
  minifiedRegister = minifiedRegister || await minify(register, { toplevel: true, compress: true, mangle: true })
  return minifiedRegister.code
}
