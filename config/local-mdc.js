module.exports = {
  port: 8080,
  dataDir: './data/local-mdc',
  publicUrl: 'http://localhost:5601/data-fair',
  wsPublicUrl: 'ws://localhost:8080',
  directoryUrl: 'http://localhost:5601/simple-directory',
  openapiViewerUrl: 'http://localhost:5601/openapi-viewer/',
  nuxtDev: false,
  catalogs: [{
    title: 'Mydatacatalogue (local)',
    href: 'http://localhost:5601',
  }],
}
