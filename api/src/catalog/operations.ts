import mime from 'mime'
import dcatContext from '../misc/utils/dcat/context.ts'

// build a DCAT catalog document (mostly useful for harvesting by data.gouv.fr) from the datasets
// of a publication site. Pure — the unit-test surface for the catalog module.
// cf https://doc.data.gouv.fr/moissonnage/dcat/
export const buildDcatCatalog = (datasets: any[], publicationSite: any, publicBaseUrl: string) => {
  const dcatDatasets = []

  const datasetUrlTemplate = publicationSite.datasetUrlTemplate || publicationSite.url + '/datasets/{id}'

  for (const dataset of datasets) {
    const datasetUrl = datasetUrlTemplate.replace('{slug}', dataset.slug).replace('{id}', dataset.id)
    const datasetDCAT: any = {
      '@id': datasetUrl,
      '@type': 'Dataset',
      identifier: dataset.slug || dataset.id,
      landingPage: datasetUrl,
      title: dataset.title,
      description: dataset.summary || dataset.description,
      issued: dataset.createdAt,
      modified: dataset.dataUpdatedAt || dataset.updatedAt
    }
    if (dataset.keywords?.length) datasetDCAT.keyword = dataset.keywords
    if (dataset.license?.href) datasetDCAT.license = dataset.license.href
    if (dataset.temporal && dataset.temporal.start) {
      if (dataset.temporal.end) {
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.end}`
      } else {
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.start}`
      }
    }
    if (dataset.frequency) datasetDCAT.accrualPeriodicity = 'http://purl.org/cld/freq/' + dataset.frequency

    const distributions = []
    if (dataset.file) {
      const originalRessourceUrl = `${publicBaseUrl}/api/v1/datasets/${dataset.slug || dataset.id}/raw`
      distributions.push({
        '@id': originalRessourceUrl,
        '@type': 'Distribution',
        identifier: `${dataset.slug || dataset.id}/raw`,
        title: `Fichier ${dataset.originalFile.name.split('.').pop()}`,
        description: `Téléchargez le fichier complet au format ${dataset.originalFile.name.split('.').pop()}.`,
        downloadURL: originalRessourceUrl,
        mediaType: dataset.originalFile.mimetype,
        format: mime.extension(dataset.originalFile.mimetype),
        bytesSize: dataset.originalFile.size
      })
      if (dataset.file.mimetype !== dataset.originalFile.mimetype) {
        const ressourceUrl = `${publicBaseUrl}/api/v1/datasets/${dataset.slug || dataset.id}/convert`
        distributions.push({
          '@id': ressourceUrl,
          '@type': 'Distribution',
          identifier: `${dataset.slug || dataset.id}/convert`,
          title: `Fichier ${dataset.file.name.split('.').pop()}`,
          description: `Téléchargez le fichier complet au format ${dataset.file.name.split('.').pop()}.`,
          downloadURL: ressourceUrl,
          mediaType: dataset.file.mimetype,
          format: mime.extension(dataset.file.mimetype),
          bytesSize: dataset.file.size
        })
      }
    }

    if (distributions.length) datasetDCAT.distribution = distributions
    dcatDatasets.push(datasetDCAT)
  }

  return {
    '@context': dcatContext,
    '@type': 'Catalog',
    conformsTo: 'https://project-open-data.cio.gov/v1.1/schema',
    describedBy: 'https://project-open-data.cio.gov/v1.1/schema/catalog.json',
    dataset: dcatDatasets
  }
}
