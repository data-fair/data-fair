import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import config from '../../api/src/config.ts'
import axios from '@data-fair/lib-node/axios.js'

const applyChanges = false

const upgradeScript: UpgradeScript = {
  description: 'Export catalogs managment',
  async exec (db, debug) {
    if (!config.privateCatalogsUrl) {
      debug('[info] Catalogs service is not enabled, skipping catalogs migration')
      return
    }
    /*
      1. Créer les nouveaux catalogs dans le projet catalogs via la private url
        -> Se baser sur les types
        -> Faire au mieux la conversion

      2. Modifier les publications de chaque dataset
        -> Pour chaque publication
        -> convertir catalog en catalogId, avec l'id du nouveau catalogue'
        -> id en publicationId
        -> Supprimer targetUrl
        -> Convertir result pour récupérer remoteDatasetId
        -> Si addToProperties
          -> Ajouter isResource
          -> Si udata
            -> Récupérer la remoteResourceId depuis le dataset distant

      3. Clean la base datafair
        -> Supprimer les anciens catalogs
        // -> Supprimer les remoteDatasets.catalog

      4. Log des stats
        -> Nombre d'anciens catalogs
        -> Nombre de nouveaux catalogs
        -> Types de catalogues non migrés
        -> Nombre de catalogues non migrés
        -> Liste des id de catalogs non migrés
          - Format des logs :
              10 catalogs à migrer
              3/5 catalogs migrés
              Types de catalogs non migrés : ['mydatacatalogue', 'geonetwork']
              Catalogs non migrés :
              - catalog1
              - catalog2

        -> Nombre de datasets avec des publications
        -> Nombre de publications par catalog
        -> Nombre de publications non migrées car catalog non migré
        -> Liste des id de datasets ayant des publications non migrées, avec leur publication non migrée
    */

    // 1. Create catalogs in the new catalogs service
    debug('[info] Step 1 : Creating catalogs in the new catalogs service')
    if (applyChanges) {
      // Check if they are already catalogs in the new catalogs service
      const res = await axios.get(`${config.privateCatalogsUrl}/api/catalogs`, {
        headers: { 'x-secret-key': config.secretKeys.catalogs }
      })
      if (res.data.length > 0) {
        debug('[info] Catalogs already exist in the new catalogs service, skipping upgrade')
        return
      }
    }

    const catalogs = await db.collection('catalogs').find({}).toArray()
    const pluginsMap = {
      arcgis: '@data-fair-catalog-arcgis',
      dcat: '@data-fair-catalog-dcat',
      udata: '@data-fair-catalog-udata',
      'data-fair': undefined,
      geonetwork: undefined,
      mydatacatalogue: undefined
    }
    /** Store data-fair catalog id as key and new catalogs catalog id */
    const newCatalogs: Record<string, any> = {}
    const catalogsStats = {
      total: catalogs.length,
      created: 0,
      notCreatedTypes: new Set(),
      notCreated: {}
    }

    // Create catalogs in the new catalogs service
    for (const catalog of catalogs) {
      const catalogPlugin = pluginsMap[catalog.type]
      if (!catalogPlugin) {
        catalogsStats.notCreatedTypes.add(catalog.type)
        catalogsStats.notCreated[catalog.id] = catalog
        debug(`[warn skip] Catalog ${catalog.id} not migrated, type ${catalog.type} not supported`)
      }

      const catalogConfig: Record<string, any> = { url: catalog.url }
      if (catalogPlugin === '@data-fair-catalog-udata') {
        if (!catalog.apiKey) debug(`[warn] No API key for udata catalog ${catalog.id}`)
        catalogConfig.apiKey = catalog.apiKey || ''
        if (catalog.organization) {
          if (catalog.organization.id && catalog.organization.name) catalogConfig.organization = catalog.organization
          else debug(`[warn] Invalid organization for udata catalog ${catalog.id} : ${JSON.stringify(catalog.organization)}`)
        }
        catalogConfig.portal = catalog.dataFairBaseUrl || 'https://koumoul.com/data-fair'
      }

      const newCatalog = {
        title: catalog.title,
        description: catalog.description,
        plugin: catalogPlugin,
        owner: catalog.owner,
        config: catalogConfig,
        created: {
          id: catalog.createdBy.id,
          name: catalog.createdBy.name ?? 'catalogs-update',
          date: catalog.createdAt
        },
        updated: {
          id: catalog.updatedBy.id,
          name: catalog.updatedBy.name ?? 'catalogs-update',
          date: catalog.updatedAt
        }
      }

      // Post on catalogs service the new catalog
      debug(`[info] Creating catalog ${catalog.id} (${catalogPlugin})`)
      const res = await axios.post(`${config.privateCatalogsUrl}/api/catalogs/_internal`, newCatalog, {
        headers: { 'x-secret-key': config.secretKeys.catalogs }
      })
      catalogsStats.created++
      newCatalogs[catalog.id] = res.data
    }

    // 2. Migrate datasets publications
    debug('[info] Step 2 : Migrating datasets publications')
    const datasets = await db.collection('datasets').find({
      publications: {
        $exists: true,
        $ne: []
      }
    }).toArray()

    const datasetsStats: Record<string, any> = {
      total: datasets.length,
      notMigrated: []
    }
    await Promise.all(datasets.map(async (dataset) => {
      const newPublications: Record<string, any>[] = []

      for (const publication of dataset.publications) {
        if (!newCatalogs[publication.catalog]._id) {
          debug(`[warn skip] Dataset ${dataset.id} publication ${publication.id} not migrated, new id for the catalog ${publication.catalog} not found`)
          datasetsStats.notMigrated.push({ datasetId: dataset.id, publication })
          continue
        }

        const newPublication: Record<string, any> = {
          puiblicationId: publication.id,
          catalogId: newCatalogs[publication.catalog]._id,
          status: publication.status
        }
        if (publication.publishedAt) newPublication.publishedAt = publication.publishedAt
        if (publication.error) newPublication.error = publication.error
        if (publication.status === 'published' && !publication.publishedAt) {
          debug(`[warn] Dataset ${dataset.id} publication ${publication.id} has no publishedAt date, but the status is published`)
        }
        if (!publication.result) {
          debug(`[warn skip] Dataset ${dataset.id} publication ${publication.id} has no result. Status : ${publication.status}`)
          continue
        }

        // Get the catalog plugin from the catalog id
        const catalog = newCatalogs[publication.catalog]
        if (catalog.plugin === '@data-fair-catalog-udata') {
          if (publication.result.id) newPublication.remoteDatasetId = publication.result.id
          else {
            debug(`[warn skip] Dataset ${dataset.id} publication ${publication.id} has no result id.`)
            continue
          }
          if (publication.addToDataset) {
            newPublication.isResource = true
            // Get the remote resource id from udata
            const res = await axios.get(`${catalog.config.url}/api/1/datasets/${newPublication.remoteDatasetId}`, {
              headers: { 'X-API-KEY': `${catalog.config.apiKey}` },
              validateStatus: (status) => (status >= 200 && status < 300) || status === 404
            })
            if (res.data) {
              const remoteResource = res.data?.resources?.find((r: any) => r.extras.datafairDatasetId === dataset.id)
              if (remoteResource) newPublication.remoteResourceId = remoteResource.id
              else {
                debug(`[warn skip] Dataset ${dataset.id} publication ${publication.id}: resource not found in the remote catalog.`)
                continue
              }
            } else {
              debug(`[warn skip] Dataset ${dataset.id} publication ${publication.id}: dataset not found in the remote catalog.`)
              continue
            }
          }
        }

        newPublications.push(newPublication)
      }

      if (applyChanges) {
        await db.collection('datasets').updateOne(
          { id: dataset.id },
          { $set: { publications: newPublications } }
        )
      }
      debug(`[info] Dataset ${dataset.id} publications migrated :`)
      // debug(`[info] Before : ${JSON.stringify(dataset.publications, null, 2)}`)
      debug(`[info] After : ${JSON.stringify(newPublications, null, 2)}`)
    }))

    // 3. Clean the database
    debug('[info] Step 3 : Cleaning the database')
    const cleanStats = { nbCatalogs: 0 }

    // Remove catalogs
    if (applyChanges) {
      debug('[info] Removing catalogs')
      const dropped = await db.dropCollection('catalogs')
      cleanStats.nbCatalogs = dropped ? catalogsStats.total : 0
    } else {
      const countResult = await db.collection('catalogs').countDocuments()
      cleanStats.nbCatalogs = countResult
    }

    // 4. Log stats
    debug('[info] Step 4 : Stats')
    debug(`[stats] ${catalogsStats.total} catalogs to migrate`)
    debug(`[stats] ${catalogsStats.created} catalogs migrated`)
    debug(`[stats] Catalogs types not migrated : ${Array.from(catalogsStats.notCreatedTypes).join(', ')}`)
    debug(`[stats] Catalogs not migrated :\n\t- ${Object.keys(catalogsStats.notCreated).join('\n\t- ')}`)

    // Log nb of remote file datasets by catalog
    const datasetsWithRemotesFiles = await db.collection('datasets').find({ 'remoteFile.catalog': { $exists: true } }).toArray()
    const remoteFileDatasetsStats = datasetsWithRemotesFiles.reduce((acc, dataset) => {
      const catalogId = dataset.remoteFile.catalog
      if (!acc[catalogId]) acc[catalogId] = 0
      acc[catalogId]++
      return acc
    }, {})
    debug(`[stats] ${datasetsWithRemotesFiles.length} remoteFiles using a catalogs`)
    for (const [catalogId, count] of Object.entries(remoteFileDatasetsStats)) {
      debug(`[stats] ${catalogId}: ${count} datasets`)
    }

    debug(`[stats] ${cleanStats.nbCatalogs} catalogs removed from datafair`)
  }
}

export default upgradeScript
