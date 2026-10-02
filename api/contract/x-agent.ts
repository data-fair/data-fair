/**
 * The x-agent annotations that turn this API's OpenAPI document into agent tools through
 * `@data-fair/openapi-mcp` (vocabulary: docs/x-agent.md in that project). Text only — nothing
 * executable is read from here. Each operation references its constant in one line; the
 * per-dataset operations are annotated once in dataset-api-docs.ts and so appear identically
 * on the root document and on every dataset's own document.
 *
 * The agent-facing surface these produce is pinned by tests/fixtures/agent-surface.<profile>.json.
 */
import type { AgentRoot, AgentOperationAnnotation, AgentProperty, AgentParamOverride } from '@data-fair/openapi-mcp'
import { documentProfiles } from './agent-profiles.ts'

const filtersDescription = 'Column filters as key-value pairs: column_key + suffix, all values strings. Example: { "ville_eq": "Paris", "age_lte": "30", "nom_search": "Jean" }. Suffixes: _eq, _neq, _in, _nin, _gt, _gte, _lt, _lte, _starts, _exists, _nexists, _search (free-text word search, default choice for text), _contains (only when enabled). If a suffix is rejected the 400 error lists what the column supports — read it and adapt. Never prefix with _c_.'

const datasetId: AgentParamOverride = { name: 'datasetId', description: 'The exact dataset ID from the "id" field in list_account_datasets (or, on a portal, list_datasets) results. Do not use the title or slug.' }

/** Geo and temporal filters, shared by every query operation. */
const queryParams: Record<string, AgentParamOverride> = {
  bbox: { description: 'Bounding box "lonMin,latMin,lonMax,latMax" (lon before lat), e.g. "-2.5,43,3,47". Geolocalized datasets only.' },
  geo_distance: { name: 'geoDistance', description: 'Proximity filter "lon,lat,distance" (lon first), e.g. "2.35,48.85,10km"; distance "0" = point-in-polygon. Geolocalized datasets only.' },
  date_match: { name: 'dateMatch', description: 'Date "YYYY-MM-DD" (single day) or "YYYY-MM-DD,YYYY-MM-DD" (range), e.g. "2023-11-21". Temporal datasets only.' },
  xyz: { exclude: true },
  qs: { exclude: true },
  q_mode: { exclude: true },
  q_ignored: { exclude: true },
  q_fields: { exclude: true },
  filters: { description: filtersDescription }
}

/** The root block of a single dataset's document: names and profiles, no cross-dataset workflow. */
export const datasetRoot: AgentRoot = {
  namePrefix: 'datafair_',
  profiles: documentProfiles(['datasets'], true)
}

export const root: AgentRoot = {
  ...datasetRoot,
  profiles: documentProfiles(['datasets', 'applications'], true),
  skills: [{
    name: 'workflow',
    profiles: ['catalog'],
    description: `You are querying French open data through Data Fair.
1. **list_datasets** — find datasets with French keywords (simple terms, not sentences). If 0 results try synonyms or broader terms.
2. **describe_dataset** — schema and metadata of a dataset. Then call **search_data** with size=3 to see sample rows before filtering.
3. Choose the tool: rows → search_data (never for statistics); breakdown per category → aggregate_data; single total/avg/min/max → calculate_metric; values of a column → get_field_values.
Filters: ${filtersDescription}
Geo filters (bbox, geoDistance) only on geolocalized datasets; sort by distance with sort "_geo_distance:lon:lat". Temporal filter dateMatch only on datasets with date columns.
Always cite the dataset page link and license. Answer in the user's language.`
  }]
}

/** On dataset.schema[].key in the dataset component. */
export const datasetSchemaKeyHint: AgentProperty = { hint: 'use this key in filters, select, sort and field params' }

/**
 * PATCH /datasets/{id} body fields per tier: content (write) and exposure (manage — portals,
 * remote catalog publications, read API key, master-data exposure, and partOf, which replaces the
 * resource's permissions with its parent's). A test checks that every
 * field of the body is in exactly one list, so a field added to the API is placed deliberately.
 */
export const datasetPatchFields = {
  write: ['slug', 'title', 'summary', 'description', 'image', 'spatial', 'temporal', 'keywords', 'searchTerms', 'frequency', 'creator', 'modified', 'attachments', 'primaryKey', 'schema', 'projection', 'conformsTo', 'license', 'origin', 'constraints', 'extensions', 'requestedPublicationSites', 'attachmentsAsImage', 'virtual', 'rest', 'topics', 'relatedDatasets', 'thumbnails', 'extras', 'customMetadata', 'analysis', 'nonBlockingValidation'],
  manage: ['publications', 'publicationSites', 'readApiKey', 'masterData', 'partOf']
}

/** PATCH /applications/{id} body fields per tier, checked like datasetPatchFields. */
export const applicationPatchFields = {
  write: ['slug', 'title', 'summary', 'description', 'image', 'configuration', 'url', 'urlDraft', 'requestedPublicationSites', 'topics', 'extras', 'preferLargeDisplay', 'attachments'],
  manage: ['publications', 'publicationSites', 'partOf']
}

const applicationId: AgentParamOverride = { name: 'applicationId', description: 'The exact application ID from the "id" field in list_account_applications results.' }

export const operations = {
  listDatasets: {
    profiles: ['read_datasets'],
    name: 'list_account_datasets',
    description: 'List the datasets owned by the active account (its department included), with optional text search. Returns id, title, status, row count, and last update.',
    params: {
      q: { description: 'French keywords for full-text search (simple terms, not sentences). Examples: "élus", "DPE", "entreprises"' },
      size: { default: 10, maximum: 50 },
      page: { default: 1 },
      mine: { exclude: true },
      owner: { exclude: true },
      raw: { exclude: true },
      ids: { exclude: true },
      filename: { exclude: true },
      concepts: { exclude: true },
      topics: { exclude: true },
      'field-type': { exclude: true },
      'field-format': { exclude: true },
      file: { exclude: true },
      rest: { exclude: true },
      bbox: { exclude: true },
      queryable: { exclude: true },
      visibility: { exclude: true }
    },
    fixed: { mine: 'true', select: 'id,slug,title,summary,topics,count,status,updatedAt,page' },
    response: { rows: '/results', concise: ['id', 'slug', 'title', 'summary', 'count', 'status', 'updatedAt', 'page'], detailed: true }
  },
  listCatalogDatasets: {
    profiles: ['catalog'],
    name: 'list_datasets',
    description: 'List the datasets published on the portal you are called from, with optional text search. Returns id, title, row count, and last update. Only available from a portal, not from the back-office.',
    params: {
      q: { description: 'French keywords for full-text search (simple terms, not sentences). Examples: "élus", "DPE", "entreprises"' },
      size: { default: 10, maximum: 50 },
      page: { default: 1 },
      files: { exclude: true },
      bbox: { exclude: true },
      queryable: { exclude: true }
    },
    fixed: { select: 'id,slug,title,summary,topics,count,updatedAt,page' },
    response: { rows: '/results', concise: ['id', 'slug', 'title', 'summary', 'count', 'updatedAt', 'page'], detailed: true }
  },
  readDescription: {
    profiles: ['catalog', 'read_datasets'],
    name: 'describe_dataset',
    description: 'Get detailed metadata and column schema for a dataset: title, description, license, topics, row count, geo/temporal coverage and every column with its type, concept and enum values. Call search_data with size=3 afterwards to see sample rows.',
    params: { id: datasetId },
    response: {
      concise: ['id', 'slug', 'title', 'summary', 'description', 'page', 'count', 'keywords', 'origin', 'license', 'topics', 'spatial', 'temporal', 'frequency', 'bbox', 'timePeriod', 'schema'],
      detailed: true
    }
  },
  readLines: {
    profiles: ['catalog', 'read_datasets'],
    name: 'search_data',
    description: 'Retrieve dataset rows matching filters and/or full-text search. Do NOT use it to compute statistics — use aggregate_data or calculate_metric. Paginate with the "after" value returned as next.',
    params: {
      id: datasetId,
      q: { name: 'query', description: 'Full-text search across all columns. Prefer filters for structured criteria.' },
      size: { default: 12, maximum: 100 },
      page: { exclude: true },
      highlight: { exclude: true },
      thumbnail: { exclude: true },
      sampling: { exclude: true },
      format: { exclude: true },
      html: { exclude: true },
      count: { exclude: true },
      hint: { exclude: true },
      collapse: { exclude: true },
      sort: { description: 'Array of column keys to sort by, one per element. Prefix a key with - for descending.' },
      select: { description: 'Column keys to include in the response, as an array. Use column keys from describe_dataset. If omitted, all columns are returned.' },
      ...queryParams
    },
    fixed: { hint: 'true' },
    response: { rows: '/results', hints: true }
  },
  getValues: {
    profiles: ['catalog', 'read_datasets'],
    name: 'get_field_values',
    description: 'List distinct values of a column. Useful to discover values before filtering with _eq or _in.',
    params: {
      id: datasetId,
      field: { name: 'fieldKey', description: 'The column key (use keys from describe_dataset)' },
      q: { description: 'Optional text to filter values (prefix/substring match within this column)' },
      size: { default: 10, maximum: 1000 },
      ...queryParams
    }
  },
  getValuesAgg: {
    profiles: ['catalog', 'read_datasets'],
    name: 'aggregate_data',
    description: 'Aggregate dataset rows by 1-3 columns with an optional metric (avg, sum, min, max, value_count, cardinality). Defaults to counting rows per group. For a single global metric without grouping, use calculate_metric.',
    params: {
      id: datasetId,
      field: { name: 'groupByColumns', description: 'Columns to GROUP BY (like SQL GROUP BY), 1 to 3 keys from describe_dataset. NOT the column to compute the metric on.' },
      metric: { description: 'Metric computed ON EACH GROUP. Omit to count rows per group.' },
      metric_field: { name: 'metricColumn', description: 'The column to compute the metric on, for the average or sum of that column. Requires metric.' },
      // Declared as an array (one size per nesting level); the vocabulary cannot target items, and
      // the server default of 20 is what agent-tools relies on too.
      agg_size: { exclude: true },
      sort: { description: 'Array with one sort key per aggregation level: "count"/"-count" (group size), "key"/"-key" (group value), "metric"/"-metric" (metric value). Example: ["-count"].' },
      interval: { exclude: true },
      html: { exclude: true },
      missing: { exclude: true },
      size: { exclude: true },
      select: { exclude: true },
      highlight: { exclude: true },
      thumbnail: { exclude: true },
      sampling: { exclude: true },
      hint: { exclude: true },
      ...queryParams
    },
    fixed: { hint: 'true', size: '0' },
    response: { rows: '/aggs', concise: ['value', 'total', 'metric'], hints: true }
  },
  getMetricAgg: {
    profiles: ['catalog', 'read_datasets'],
    name: 'calculate_metric',
    description: 'Calculate a single metric on a dataset column: avg, sum, min, max, stats, value_count, cardinality, percentiles. For per-group breakdowns, use aggregate_data.',
    params: {
      id: datasetId,
      field: { name: 'fieldKey', description: 'The column key to calculate the metric on (use keys from describe_dataset)' },
      metric: { description: 'avg, sum, min, max (numbers); min, max, cardinality, value_count (strings); stats returns count/min/max/avg/sum; percentiles returns a distribution.' },
      percents: { description: 'Comma-separated percentages for the percentiles metric (default "1,5,25,50,75,95,99").' },
      ...queryParams
    },
    response: { rows: '/metric' }
  },
  writeDescription: [
    {
      profiles: ['write_datasets'],
      name: 'update_dataset',
      description: 'Update the metadata or configuration of a dataset: title, description, keywords, license, topics, schema… Send only the fields to change. Array and object fields (topics, keywords, attachments, schema, configuration…) replace the current value entirely: read it first with describe_dataset and send the complete new value. Publishing on portals, publications to remote catalogs, the read API key, master-data exposure and attaching to a parent (partOf) are done with publish_dataset.',
      params: { id: datasetId },
      body: 'compact',
      bodyFields: datasetPatchFields.write
    },
    {
      profiles: ['manage_datasets'],
      name: 'publish_dataset',
      description: 'Change how a dataset is exposed: the portals it is published on (publicationSites), its publications to remote catalogs, its read API key, its master-data exposure, and its parent resource (partOf, which replaces its permissions with those of the parent). Send only the fields to change.',
      params: { id: datasetId },
      body: 'compact',
      bodyFields: datasetPatchFields.manage
    }
  ],
  deleteDataset: {
    profiles: ['manage_datasets'],
    name: 'delete_dataset',
    description: 'Delete a dataset permanently, with its data. The datasets and applications attached to it (partOf) are deleted too. Irreversible.',
    params: { id: datasetId }
  },
  getDatasetPermissions: {
    profiles: ['manage_datasets'],
    name: 'get_dataset_permissions',
    description: 'Read who can access a dataset: its permission entries for users, organizations, roles and departments, or for everyone.',
    params: { id: datasetId }
  },
  setDatasetPermissions: {
    profiles: ['manage_datasets'],
    name: 'set_dataset_permissions',
    description: 'Replace the whole list of permission entries of a dataset. Read it with get_dataset_permissions first, then send the complete new list.',
    annotations: { destructiveHint: true },
    params: { id: datasetId }
  },
  listApplications: {
    profiles: ['read_applications'],
    name: 'list_account_applications',
    description: 'List the applications (data visualizations) owned by the active account (its department included), with optional text search. Returns id, title, status and last update.',
    params: {
      q: { description: 'Keywords for full-text search.' },
      dataset: { description: 'Restrict to the applications using these datasets (ids from list_account_datasets).' },
      size: { default: 10, maximum: 50 },
      page: { default: 1 },
      mine: { exclude: true },
      owner: { exclude: true },
      raw: { exclude: true },
      ids: { exclude: true },
      service: { exclude: true },
      visibility: { exclude: true }
    },
    fixed: { mine: 'true', select: 'id,slug,title,summary,status,updatedAt,page' },
    response: { rows: '/results', concise: ['id', 'slug', 'title', 'summary', 'status', 'updatedAt', 'page'], detailed: true }
  },
  getApplication: {
    profiles: ['read_applications'],
    name: 'describe_application',
    description: 'Get the metadata and configuration of an application: title, description, base application, the datasets its configuration uses, publication status.',
    params: { id: applicationId }
  },
  patchApplication: [
    {
      profiles: ['write_applications'],
      name: 'update_application',
      description: 'Update the metadata or configuration of an application: title, description, topics, configuration… Send only the fields to change. Array and object fields (topics, keywords, attachments, schema, configuration…) replace the current value entirely: read it first with describe_application and send the complete new value. Publishing on portals, publications to remote catalogs and attaching to a parent (partOf) are done with publish_application. Do not change configuration.datasets[].applicationKeyPermissions unless explicitly asked: it decides what anyone holding the application key can do on that dataset; send it back as you read it.',
      params: { id: applicationId },
      bodyFields: applicationPatchFields.write
    },
    {
      profiles: ['manage_applications'],
      name: 'publish_application',
      description: 'Change where an application is exposed: the portals it is published on (publicationSites), its publications to remote catalogs, and its parent resource (partOf, which replaces its permissions with those of the parent). Send only the fields to change.',
      params: { id: applicationId },
      bodyFields: applicationPatchFields.manage
    }
  ],
  deleteApplication: {
    profiles: ['manage_applications'],
    name: 'delete_application',
    description: 'Delete an application permanently. The datasets and applications attached to it (partOf) are deleted too. Irreversible.',
    params: { id: applicationId }
  }
} satisfies Record<string, AgentOperationAnnotation>
