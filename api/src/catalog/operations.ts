import mimeTypes from 'mime-types'
import dcatContext from '../misc/utils/dcat/context.ts'

// output-only refinements of the shared DCAT-US context (also used to read harvested catalogs):
// real date-time datatypes and IRIs instead of plain strings, the JSON shape stays the same
const dcatUsOutputContext = {
  ...dcatContext,
  issued: { '@id': 'dct:issued', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
  modified: { '@id': 'dct:modified', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
  landingPage: { '@id': 'dcat:landingPage', '@type': '@id' },
  license: { '@id': 'dct:license', '@type': '@id' },
  accrualPeriodicity: { '@id': 'dct:accrualPeriodicity', '@type': '@id' },
  hasEmail: { '@id': 'vcard:hasEmail', '@type': '@id' }
}

// build a DCAT-US catalog document from the datasets of a publication site, cf docs/architecture/dcat-catalog.md
export const buildDcatCatalog = (datasets: any[], publicationSite: any, publicBaseUrl: string, ownerInfo: any = {}) => {
  const dcatDatasets = []

  const datasetUrlTemplate = publicationSite.datasetUrlTemplate || publicationSite.url + '/datasets/{id}'
  const contact = ownerInfo.contact
  const contactPoint = contact?.email
    ? { '@type': 'vcard:Contact', fn: contact.name || publicationSite.owner?.name || contact.email, hasEmail: 'mailto:' + contact.email }
    : undefined

  for (const dataset of datasets) {
    const datasetUrl = datasetUrlTemplate.replace('{slug}', dataset.slug).replace('{id}', dataset.id)
    const datasetApiUrl = `${publicBaseUrl}/api/v1/datasets/${dataset.slug || dataset.id}`
    const datasetDCAT: any = {
      '@id': datasetUrl,
      '@type': 'Dataset',
      identifier: dataset.slug || dataset.id,
      landingPage: datasetUrl,
      title: dataset.title,
      description: dataset.description || dataset.summary,
      issued: dataset.createdAt,
      modified: dataset.dataUpdatedAt || dataset.updatedAt
    }
    if (dataset.keywords?.length) datasetDCAT.keyword = dataset.keywords
    if (dataset.topics?.length) datasetDCAT.theme = [...new Set(dataset.topics.map((t: any) => t.title).filter(Boolean))]
    if (dataset.license?.href) datasetDCAT.license = dataset.license.href
    if (dataset.owner?.name) {
      datasetDCAT.publisher = { '@type': 'org:Organization', name: dataset.owner.departmentName ? `${dataset.owner.name} - ${dataset.owner.departmentName}` : dataset.owner.name }
    }
    if (contactPoint) datasetDCAT.contactPoint = contactPoint
    if (dataset.spatial) datasetDCAT.spatial = dataset.spatial
    else if (dataset.bbox?.length === 4) datasetDCAT.spatial = dataset.bbox.join(',')
    if (dataset.temporal && dataset.temporal.start) {
      if (dataset.temporal.end) {
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.end}`
      } else {
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.start}`
      }
    }
    if (dataset.frequency) datasetDCAT.accrualPeriodicity = 'http://purl.org/cld/freq/' + dataset.frequency

    const distributions = []
    const fileDistribution = (file: any, suffix: string) => {
      const url = `${datasetApiUrl}/${suffix}`
      const ext = file.name.split('.').pop()
      return {
        '@id': url,
        '@type': 'Distribution',
        identifier: `${dataset.slug || dataset.id}/${suffix}`,
        title: `Fichier ${ext}`,
        description: `Téléchargez le fichier complet au format ${ext}.`,
        downloadURL: url,
        mediaType: file.mimetype,
        format: mimeTypes.extension(file.mimetype) || undefined,
        byteSize: file.size
      }
    }
    if (dataset.file && dataset.originalFile) {
      distributions.push(fileDistribution(dataset.originalFile, 'raw'))
      if (dataset.file.mimetype !== dataset.originalFile.mimetype) distributions.push(fileDistribution(dataset.file, 'convert'))
    }
    if (!dataset.isMetaOnly) {
      // DCAT-US convention for an API: format "API" and its documentation in describedBy
      distributions.push({
        '@id': `${datasetApiUrl}/lines`,
        '@type': 'Distribution',
        identifier: `${dataset.slug || dataset.id}/lines`,
        title: 'API',
        description: 'Consultez, filtrez et exportez les données grâce à l\'API.',
        accessURL: `${datasetApiUrl}/lines`,
        format: 'API',
        mediaType: 'application/json',
        describedBy: `${datasetApiUrl}/api-docs.json`,
        describedByType: 'application/vnd.oai.openapi+json'
      })
    }

    if (distributions.length) datasetDCAT.distribution = distributions
    dcatDatasets.push(datasetDCAT)
  }

  return {
    '@context': dcatUsOutputContext,
    '@type': 'Catalog',
    conformsTo: 'https://project-open-data.cio.gov/v1.1/schema',
    describedBy: 'https://project-open-data.cio.gov/v1.1/schema/catalog.json',
    dataset: dcatDatasets
  }
}

// DCAT-AP 3 (European profile, the one data.gouv.fr and data.europa.eu harvest), serialized as JSON-LD
// with prefixed property names, cf docs/architecture/dcat-catalog.md
const dcatApContext = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  gsp: 'http://www.opengis.net/ont/geosparql#'
}

const euFrequency = 'http://publications.europa.eu/resource/authority/frequency/'
const frequencies: Record<string, string> = {
  irregular: 'IRREG',
  continuous: 'UPDATE_CONT',
  daily: 'DAILY',
  threeTimesAWeek: 'WEEKLY_3',
  semiweekly: 'WEEKLY_2',
  weekly: 'WEEKLY',
  threeTimesAMonth: 'MONTHLY_3',
  biweekly: 'BIWEEKLY',
  semimonthly: 'MONTHLY_2',
  monthly: 'MONTHLY',
  bimonthly: 'BIMONTHLY',
  quarterly: 'QUARTERLY',
  threeTimesAYear: 'ANNUAL_3',
  semiannual: 'ANNUAL_2',
  annual: 'ANNUAL',
  biennial: 'BIENNIAL',
  triennial: 'TRIENNIAL'
}

// file extensions known by the EU file-type vocabulary
const euFileType = 'http://publications.europa.eu/resource/authority/file-type/'
const fileTypes: Record<string, string> = {
  csv: 'CSV', tsv: 'TSV', txt: 'TXT', json: 'JSON', geojson: 'GEOJSON', xml: 'XML', xlsx: 'XLSX', xls: 'XLS', ods: 'ODS', dbf: 'DBF', shp: 'SHP', kml: 'KML', kmz: 'KMZ', gpx: 'GPX', zip: 'ZIP', gz: 'GZIP', parquet: 'PARQUET', pdf: 'PDF'
}

const dcatApTexts = {
  fr: {
    catalogDescription: (title: string) => `Catalogue des jeux de données publiés sur ${title}.`,
    fileTitle: (ext: string) => `Fichier ${ext}`,
    fileDescription: (ext: string) => `Téléchargez le fichier complet au format ${ext}.`,
    apiTitle: 'API',
    apiDescription: 'Consultez, filtrez et exportez les données grâce à l\'API.'
  },
  en: {
    catalogDescription: (title: string) => `Catalog of the datasets published on ${title}.`,
    fileTitle: (ext: string) => `${ext} file`,
    fileDescription: (ext: string) => `Download the complete file in ${ext} format.`,
    apiTitle: 'API',
    apiDescription: 'Browse, filter and export the data through the API.'
  }
}

// typed IRIs satisfy the range classes of the DCAT-AP SHACL shapes
const iri = (url: string, type?: string) => type ? { '@id': url, '@type': type } : { '@id': url }
const dateLiteral = (value: string) => ({ '@value': value, '@type': /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'xsd:date' : 'xsd:dateTime' })
const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

export const buildDcatApCatalog = (datasets: any[], publicationSite: any, publicBaseUrl: string, ownerInfo: any = {}, locale = 'fr') => {
  const texts = locale === 'en' ? dcatApTexts.en : dcatApTexts.fr
  const datasetUrlTemplate = publicationSite.datasetUrlTemplate || publicationSite.url + '/datasets/{id}'
  const siteTitle = publicationSite.title || publicationSite.owner?.name || publicationSite.url

  const contact = ownerInfo.contact
  const contactPoint = (contact?.email || contact?.url)
    ? {
        '@type': ['vcard:Kind', 'vcard:Organization'],
        'vcard:fn': contact.name || publicationSite.owner?.name,
        'vcard:hasEmail': contact.email ? iri('mailto:' + contact.email) : undefined,
        'vcard:hasURL': contact.url ? iri(contact.url) : undefined
      }
    : undefined

  const agent = (name?: string) => name ? { '@type': 'foaf:Agent', 'foaf:name': name } : undefined

  let catalogModified: string | undefined
  const dcatDatasets = []
  for (const dataset of datasets) {
    const datasetUrl = datasetUrlTemplate.replace('{slug}', dataset.slug).replace('{id}', dataset.id)
    const datasetApiUrl = `${publicBaseUrl}/api/v1/datasets/${dataset.slug || dataset.id}`
    const license = dataset.license?.href ? iri(dataset.license.href, 'dct:LicenseDocument') : undefined
    const modified = dataset.modified || dataset.dataUpdatedAt || dataset.updatedAt
    if (modified && (!catalogModified || modified > catalogModified)) catalogModified = modified

    const distributions: any[] = []
    const fileDistribution = (file: any, url: string, identifier: string, title?: string, description?: string): Record<string, any> => {
      const ext = fileExtension(file.name ?? url)
      const mediaType = file.mimetype?.split(';')[0].trim()
      return {
        '@id': url,
        '@type': 'dcat:Distribution',
        'dct:identifier': identifier,
        'dct:title': title || texts.fileTitle(ext),
        'dct:description': description || (title ? undefined : texts.fileDescription(ext)),
        'dcat:accessURL': iri(url),
        'dcat:downloadURL': iri(url),
        'dcat:mediaType': mediaType ? iri('https://www.iana.org/assignments/media-types/' + mediaType, 'dct:MediaType') : undefined,
        'dct:format': fileTypes[ext] ? iri(euFileType + fileTypes[ext], 'dct:MediaTypeOrExtent') : undefined,
        'dcat:byteSize': file.size ? { '@value': file.size, '@type': 'xsd:nonNegativeInteger' } : undefined,
        'dct:modified': file.updatedAt ? dateLiteral(file.updatedAt) : undefined,
        'dct:license': license
      }
    }
    if (dataset.file && dataset.originalFile) {
      const original = { ...dataset.originalFile, updatedAt: dataset.dataUpdatedAt }
      distributions.push(fileDistribution(original, `${datasetApiUrl}/raw`, `${dataset.id}/raw`))
      if (dataset.file.mimetype !== dataset.originalFile.mimetype) {
        distributions.push(fileDistribution({ ...dataset.file, updatedAt: dataset.dataUpdatedAt }, `${datasetApiUrl}/convert`, `${dataset.id}/convert`))
      }
    }
    for (const attachment of dataset.attachments ?? []) {
      if (!attachment.includeInCatalogPublications) continue
      const url = attachment.type === 'url' ? attachment.url : `${datasetApiUrl}/metadata-attachments/${encodeURIComponent(attachment.name)}`
      if (!url) continue
      const distribution = fileDistribution(attachment, url, `${dataset.id}/attachments/${attachment.name ?? attachment.url}`, attachment.title, attachment.description)
      // a link may be a web page, not a download
      if (attachment.type === 'url') delete distribution['dcat:downloadURL']
      distributions.push(distribution)
    }
    // every dataset with data has a queryable API, the only distribution of REST and virtual datasets
    if (!dataset.isMetaOnly) {
      distributions.push({
        '@id': `${datasetApiUrl}/lines`,
        '@type': 'dcat:Distribution',
        'dct:identifier': `${dataset.id}/lines`,
        'dct:title': texts.apiTitle,
        'dct:description': texts.apiDescription,
        'dcat:accessURL': iri(`${datasetApiUrl}/lines`),
        'dcat:mediaType': iri('https://www.iana.org/assignments/media-types/application/json', 'dct:MediaType'),
        'dct:format': iri(euFileType + 'JSON', 'dct:MediaTypeOrExtent'),
        'dct:license': license,
        'dcat:accessService': {
          '@id': datasetApiUrl,
          '@type': 'dcat:DataService',
          'dct:title': `API - ${dataset.title}`,
          'dcat:endpointURL': iri(datasetApiUrl),
          'dcat:endpointDescription': iri(`${datasetApiUrl}/api-docs.json`),
          'dcat:servesDataset': iri(datasetUrl),
          'dct:license': license
        }
      })
    }

    let spatial
    if (dataset.spatial || dataset.bbox?.length === 4) {
      const [w, s, e, n] = dataset.bbox ?? []
      spatial = {
        '@type': 'dct:Location',
        'skos:prefLabel': dataset.spatial || undefined,
        'dcat:bbox': dataset.bbox?.length === 4
          ? { '@value': `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`, '@type': 'gsp:wktLiteral' }
          : undefined
      }
    }

    dcatDatasets.push({
      '@id': datasetUrl,
      '@type': 'dcat:Dataset',
      'dct:identifier': dataset.id,
      'dct:title': dataset.title,
      'dct:description': dataset.description || dataset.summary || dataset.title,
      'dcat:landingPage': iri(datasetUrl, 'foaf:Document'),
      'dct:issued': dataset.createdAt ? dateLiteral(dataset.createdAt) : undefined,
      'dct:modified': modified ? dateLiteral(modified) : undefined,
      'dcat:keyword': dataset.keywords?.length ? dataset.keywords : undefined,
      'dcat:theme': dataset.topics?.length ? dataset.topics.map((t: any) => ({ '@type': 'skos:Concept', 'skos:prefLabel': t.title })) : undefined,
      'dct:license': license,
      'dct:publisher': agent(dataset.owner?.departmentName ? `${dataset.owner.name} - ${dataset.owner.departmentName}` : dataset.owner?.name),
      'dct:creator': agent(dataset.creator),
      'dcat:contactPoint': contactPoint,
      'dct:accrualPeriodicity': frequencies[dataset.frequency] ? iri(euFrequency + frequencies[dataset.frequency], 'dct:Frequency') : undefined,
      'dct:temporal': dataset.temporal?.start
        ? {
            '@type': 'dct:PeriodOfTime',
            'dcat:startDate': dateLiteral(dataset.temporal.start),
            'dcat:endDate': dataset.temporal.end ? dateLiteral(dataset.temporal.end) : undefined
          }
        : undefined,
      'dct:spatial': spatial,
      'dcat:distribution': distributions.length ? distributions : undefined
    })
  }

  return {
    '@context': dcatApContext,
    '@id': `${publicBaseUrl}/api/v1/catalog/dcat-ap`,
    '@type': 'dcat:Catalog',
    'dct:title': siteTitle,
    'dct:description': texts.catalogDescription(siteTitle),
    'dct:publisher': agent(publicationSite.owner?.name),
    'foaf:homepage': iri(publicationSite.url, 'foaf:Document'),
    'dct:modified': catalogModified ? dateLiteral(catalogModified) : undefined,
    'dcat:dataset': dcatDatasets
  }
}
