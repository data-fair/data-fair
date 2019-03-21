// Prepare dynamic service workers configurations for data-fair applications
const config = require('config')
const escapeStringRegexp = require('escape-string-regexp')

exports.sw = (application) => {
  const cleanApplicationUrl = application.url.replace(/\/$/, '')

  // Use workbox for powerful and easy service workers management
  let sw = `
importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.6.1/workbox-sw.js');
`

  // Use workbox debug version only in development
  if (process.env.DEBUG && process.env.DEBUG.includes('service-workers')) {
    sw += `
workbox.setConfig({
  debug: true
});
workbox.core.setLogLevel(workbox.core.LOG_LEVELS.debug);
`
  }

  // Activate the service worker as fast as possible
  sw += `
workbox.clientsClaim();
workbox.skipWaiting();
`
  // Cache first for application's source code
  // applications should use hashes in resource names
  sw += `
workbox.routing.registerRoute(
  new RegExp('^${escapeStringRegexp(cleanApplicationUrl)}'),
  workbox.strategies.cacheFirst({cacheName: 'data-fair'})
);
`

  // Content from proxied remote services is not refreshed as often
  // fast loading using stale version should not be a problem
  sw += `
workbox.routing.registerRoute(
  new RegExp('${escapeStringRegexp(new URL(config.publicUrl).pathname)}api/v1/remote-services/.*/proxy/.*'),
  workbox.strategies.staleWhileRevalidate({cacheName: 'data-fair'})
);
`
  // Cache first for datasets queries that are performed with explicit
  // cache invalidation using finalizedAt=... query param
  sw += `
workbox.routing.registerRoute(
  new RegExp('${escapeStringRegexp(new URL(config.publicUrl).pathname)}api/v1/datasets/.*finalizedAt=.*'),
  workbox.strategies.cacheFirst({cacheName: 'data-fair'})
);
`

  // Network first for all other calls from data-fair domain
  // freshness of data from datasets is the priority
  sw += `
workbox.routing.registerRoute(
  new RegExp('/.*'),
  workbox.strategies.networkFirst({cacheName: 'data-fair'})
);
`

  return sw
}

exports.register = (application) => {
  const base = new URL(application.exposedUrl).pathname
  // The base is the url without a trailing slash
  // and the service worker is not exposed behind a slash
  // so that we can accept accessing the application without a trailing slash
  return `
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('${base}-sw.js', { scope: '${base}' }).then(function(reg) {
    // registration worked
    console.log('Service worker registration succeeded. Scope is ' + reg.scope);
  }).catch(function(error) {
    // registration failed
    console.log('Service worker registration failed with ' + error);
  });
};
`
}
