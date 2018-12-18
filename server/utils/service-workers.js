// Prepare dynamic service workers configurations for data-fair applications
const config = require('config')
const escapeStringRegexp = require('escape-string-regexp')

exports.sw = (application) => {
  const cleanApplicationUrl = application.url.replace(/\/$/, '')
  return `
importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.6.1/workbox-sw.js');
workbox.setConfig({
  debug: true
});
workbox.core.setLogLevel(workbox.core.LOG_LEVELS.debug);
workbox.clientsClaim();
workbox.skipWaiting();
// Cache first for application's source code
workbox.routing.registerRoute(
  new RegExp('^${escapeStringRegexp(cleanApplicationUrl)}'),
  workbox.strategies.cacheFirst({})
);
// Network first for all the calls from data-fair domain
workbox.routing.registerRoute(
  new RegExp('/.*'),
  workbox.strategies.networkFirst({})
);
`
}

exports.register = (application) => {
  const base = new URL(application.exposedUrl).pathname
  return `
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('${base}-sw.js', { scope: '${base}' }).then(function(reg) {
    // registration worked
    console.log('Registration succeeded. Scope is ' + reg.scope);
  }).catch(function(error) {
    // registration failed
    console.log('Registration failed with ' + error);
  });
};
`
}
