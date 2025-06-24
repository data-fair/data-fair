import { Mongo } from '@data-fair/lib-node/mongo.js'
import config from '#config'
import type { Application, ApplicationKey, Dataset, Limits, RemoteService } from '#types'
import type { DepartmentSettings } from '#types/department-settings/index.js'
import type { Settings } from '#types/settings/index.js'

export class DfMongo {
  mongo: Mongo

  get client () {
    return this.mongo.client
  }

  get db () {
    return this.mongo.db
  }

  get datasets () {
    return this.mongo.db.collection<Dataset & { _id: string }>('datasets')
  }

  get applications () {
    return this.mongo.db.collection<Application & { _id: string }>('applications')
  }

  get applicationsKeys () {
    return this.mongo.db.collection<ApplicationKey>('applications-keys')
  }

  get limits () {
    return this.mongo.db.collection<Limits>('limits')
  }

  get settings () {
    return this.mongo.db.collection<Settings | DepartmentSettings>('settings')
  }

  get remoteServices () {
    return this.mongo.db.collection<RemoteService>('settings')
  }

  constructor () {
    this.mongo = new Mongo()
  }

  connect = async () => {
    // manage retro-compatibility with STORAGE_MONGO_URL and STORAGE_MONGO_CLIENT_OPTIONS
    const options = { ...config.mongo.options }
    // workers generate a lot of opened sockets if we do not change this setting
    if (config.mode === 'task') options.maxPoolSize = 1
    await this.mongo.connect(config.mongo.url, options)
  }

  init = async () => {
    await this.connect()
    await this.mongo.configure({
      datasets: {
        id_1: [{ id: 1 }, { unique: true }],
        'unique-refs': [{ _uniqueRefs: 1, 'owner.type': 1, 'owner.id': 1 }, { unique: true }], // used to prevent conflicts accross ids and slugs
        'main-keys': { 'owner.type': 1, 'owner.id': 1, createdAt: -1 }, // used to fetch list sorted by creation
        fulltext: [{ title: 'text', description: 'text', 'owner.name': 'text', 'owner.departmentName': 'text', keywords: 'text', 'topics.title': 'text' }, { weights: { title: 2 } }],
        // special purpose indexes for workers, etc
        'virtual.children_1': { 'virtual.children': 1 },
        publicationSites_1: { publicationSites: 1 },
        'rest.ttl.checkedAt_1': { 'rest.ttl.checkedAt': 1 },
        'rest.ttl.active_1': { 'rest.ttl.active': 1 },
        'remoteFile.autoUpdate.nextUpdate_1': { 'remoteFile.autoUpdate.nextUpdate': 1 },
        '_readApiKey.renewAt_1': { '_readApiKey.renewAt': 1 },
        _partialRestStatus_1: [{ _partialRestStatus: 1 }, { sparse: true }],
        esWarning_1: { esWarning: 1 }
      },
      'remote-services': {
        id_1: [{ id: 1 }, { unique: true }],
        fulltext: [{ title: 'text', description: 'text' }, { weights: { title: 2 } }],
        'virtualDatasets-active': { 'virtualDatasets.active': 1 },
        'virtualDatasets-parent': { 'virtualDatasets.parent.id': 1 },
        'standardSchema-active': { 'standardSchema.active': 1 }
      },
      'base-applications': {
        url_1: [{ url: 1 }, { unique: true }],
        id_1: [{ id: 1 }, { unique: true }],
        fulltext: [{ title: 'text', description: 'text', 'meta.title': 'text', 'meta.description': 'text', 'meta.application-name': 'text' }, { weights: { title: 2 } }]
      },
      applications: {
        id_1: [{ id: 1 }, { unique: true }],
        'unique-refs': [{ _uniqueRefs: 1, 'owner.type': 1, 'owner.id': 1 }, { unique: true }], // used to prevent conflicts accross ids and slugs
        'main-keys': { 'owner.type': 1, 'owner.id': 1, createdAt: -1 }, // used to fetch list sorted by creation
        fulltext: [{ title: 'text', description: 'text', 'owner.name': 'text', 'owner.departmentName': 'text' }, { weights: { title: 2 } }],
        // get linked applications
        'configuration.datasets.href_1': { 'configuration.datasets.href': 1 },
        'datasets-id': [{ 'configuration.datasets.id': 1 }, { sparse: true }],
        'child-app-id': [{ 'configuration.applications.id': 1 }, { sparse: true }]
      },
      'applications-keys': {
        'keys.id_1': { 'keys.id': 1 }
      },
      catalogs: {
        id_1: [{ id: 1 }, { unique: true }],
        'owner.type_1_owner.id_1': { 'owner.type': 1, 'owner.id': 1 },
        fulltext: [{ title: 'text', description: 'text', 'owner.name': 'text' }, { weights: { title: 2 } }]
      },
      settings: {
        'main-keys': [{ type: 1, id: 1, department: 1 }, { unique: true }],
        'apiKeys.key_1': [{ 'apiKeys.key': 1 }, { sparse: true }],
        'publicationSites.url_1': [{ 'publicationSites.url': 1 }, { sparse: true }]
      },
      // shared extensions cache with a 10 days expiration delay
      'extensions-cache': {
        'main-keys': { extensionKey: 1, input: 1 },
        expiration: [{ lastUsed: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 10 }]
      },
      journals: {
        'type_1_id_1_owner.type_1_owner.id_1': { type: 1, id: 1, 'owner.type': 1, 'owner.id': 1 }
      },
      // thumbnails cache with a 10 days expiration delay
      'thumbnails-cache': {
        'main-keys': [{ url: 1, width: 1, height: 1, fit: 1, position: 1 }, { unique: true }],
        expiration: [{ lastUpdated: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 10 }]
      },
      limits: {
        fulltext: [{ id: 'text', name: 'text' }, { name: 'fulltext' }],
        'limits-find-current': [{ type: 1, id: 1 }, { unique: true }]
      }
    })
  }
}

const dfMongo = new DfMongo()

export default dfMongo
