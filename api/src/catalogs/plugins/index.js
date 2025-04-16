import { nanoid } from 'nanoid'
import config from '#config'
import mongo from '#mongo'
import axios from '../../misc/utils/axios.js'
import * as journals from '../../misc/utils/journals.js'
import * as permissionsUtil from '../../misc/utils/permissions.js'

const axiosOptions = {
  headers: {
    'x-secret-key': config.secretKeys.catalogs,
  }
}

/**
 * Publish (or delete) a resource (dataset or app) to a catalog
 * @param {any} app The application name
 * @param {string} type dataset or application
 * @param {any} resource The resource to publish
 */
export const processPublications = async function (app, type, resource) {
  const resourcesCollection = mongo.db.collection(type + 's')
  resource.public = permissionsUtil.isPublic(type + 's', resource)

  // Add an id for each publication if not already set
  for (const p of resource.publications) if (!p.publicationId) p.publicationId = nanoid()
  await resourcesCollection.updateOne({ id: resource.id }, { $set: { publications: resource.publications } })

  let processedPublication = resource.publications.find(p => ['waiting', 'deleted'].includes(p.status))

  /**
   * Patch the publication in the resource
   * @param {*} error The error message if the publication failed
   * @returns {Promise<any>}
   */
  async function setResult (error) {
    const patch = {}

    if (error) {
      // Publishing or deletion failed
      processedPublication.status = patch['publications.$.status'] = 'error'
      processedPublication.error = patch['publications.$.error'] = error
    } else if (processedPublication.status === 'waiting') {
      // Publishing worked
      processedPublication.status = patch['publications.$.status'] = 'published'
      patch['publications.$.publishedAt'] = new Date().toISOString()
      patch['publications.$.remoteDatasetId'] = processedPublication.remoteDatasetId
    } else if (processedPublication.status === 'deleted') {
      // Deletion worked, we can remove the publication from the resource
      return resourcesCollection.updateOne(
        { id: resource.id },
        { $pull: { publications: { publicationId: processedPublication.publicationId } } }
      )
    }

    if (Object.keys(patch).length) {
      await resourcesCollection.updateOne(
        { id: resource.id, 'publications.publicationId': processedPublication.publicationId },
        { $set: patch }
      )
    }
  }

  try {
    if (processedPublication.status === 'deleted') {
      await axios.delete(`${config.privateCatalogsUrl}/api/catalogs/${processedPublication.catalogId}/dataset/${processedPublication.remoteDatasetId}`, axiosOptions)
      await journals.log(app, resource, { type: 'publication', data: 'Suppression de la publication vers un catalogue' }, type)
    } else if (processedPublication.status === 'waiting') {
      const firstPublication = !processedPublication.remoteDatasetId
      processedPublication = (await axios.post(`${config.privateCatalogsUrl}/api/catalogs/${processedPublication.catalogId}/dataset`, {
        dataset: resource,
        publication: processedPublication
      }, axiosOptions)).data

      if (firstPublication) await journals.log(app, resource, { type: 'publication', data: 'Nouvelle publication vers un catalogue' }, type)
      else await journals.log(app, resource, { type: 'publication', data: 'Publication mise à jour vers un catalogue' }, type)
    }
    await setResult(null)
  } catch (err) {
    console.warn('Error while processing publication', err)
    await journals.log(app, resource, { type: 'error', data: err.message || err }, type)
    await setResult(err.message || err)
  }
}
