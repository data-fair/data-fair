// the API exposed by a dataset can be referenced as a remote service
// by another (or the same) data-fair instance

const assert = require('assert').strict
const workers = require('../server/workers')

describe('Master data management', () => {
  it('should define and use a dataset as master-data remote-service used for extensions', async () => {
    // create  master dataset
    const ax = global.ax.superadmin
    const siretProperty = {
      key: 'siret',
      title: 'Siret',
      type: 'string',
      'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret',
    }
    await ax.put('/api/v1/datasets/master', {
      isRest: true,
      title: 'master',
      schema: [
        siretProperty,
        { key: 'extra', type: 'string' },
      ],
      masterData: {
        bulkSearchs: [{
          id: 'siret',
          title: 'Fetch extra info from siret',
          description: '',
          input: [{
            type: 'equals',
            property: siretProperty,
          }],
        }],
      },
    })
    await workers.hook('indexer/master')
    const master = (await ax.get('api/v1/datasets/master')).data
    const items = [
      { siret: '82898347800011', extra: 'Extra information' },
    ]
    await ax.post('/api/v1/datasets/master/_bulk_lines', items.map(item => ({ _id: item.siret, ...item })))

    // create api key to use dataset from remote service
    const res = await ax.put('/api/v1/settings/user/superadmin', { apiKeys: [{ title: 'key1', scopes: ['datasets'] }] })
    const apiKey = res.data.apiKeys[0].clearKey

    // the api doc should be extended based on masterData parameters
    const apiDocUrl = master.href + '/api-docs.json'
    const apiDoc = (await ax.get(apiDocUrl)).data
    const bulkSearchDoc = apiDoc.paths['/master-data/bulk-searchs/siret']
    assert.ok(bulkSearchDoc)
    assert.ok(bulkSearchDoc.post)
    assert.equal(bulkSearchDoc.post.operationId, 'masterData_bulkSearch_siret')
    assert.equal(bulkSearchDoc.post.summary, 'Fetch extra info from siret')

    // declare the master dataset as a remote service based on its api doc
    const remoteService = (await ax.post('/api/v1/remote-services', {
      apiDoc,
      url: apiDocUrl,
      server: apiDoc.servers[0].url,
      apiKey: {
        in: 'header',
        name: 'x-apiKey',
        value: apiKey,
      },
    })).data
    assert.equal(remoteService.apiDoc.info['x-api-id'], 'localhost-dataset-master')
    assert.equal(remoteService.id, 'localhost-dataset-master')
    assert.equal(remoteService.actions.length, 1)
    assert.equal(remoteService.actions[0].id, 'masterData_bulkSearch_siret')

    // create slave dataset
    await ax.put('/api/v1/datasets/slave', {
      isRest: true,
      title: 'slave',
      schema: [siretProperty],
      extensions: [{
        active: true,
        remoteService: remoteService.id,
        action: 'masterData_bulkSearch_siret',
        select: ['extra'],
      }],
    })
    await workers.hook('finalizer/slave')
    await ax.post('/api/v1/datasets/slave/_bulk_lines', [{ siret: '82898347800011' }].map(item => ({ _id: item.siret, ...item })))
    const slave = await workers.hook('finalizer/slave')
    assert.ok(slave.schema.find(p => p.key === '_ext_localhost-dataset-master_masterData_bulkSearch_siret.extra'))
    assert.ok(slave.schema.find(p => p.key === '_ext_localhost-dataset-master_masterData_bulkSearch_siret._error'))
    assert.equal(slave.extensions[0].progress, 1)
    const results = (await ax.get('/api/v1/datasets/slave/lines')).data.results
    assert.equal(results[0]['_ext_localhost-dataset-master_masterData_bulkSearch_siret.extra'], 'Extra information')
    assert.ok(!results[0]['_ext_localhost-dataset-master_masterData_bulkSearch_siret.siret'])
  })
})
