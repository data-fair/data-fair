import type { Dataset, ResourceType } from '@data-fair/data-fair-api/types/index.ts'

/**
 * Single source of truth for API operations and permission classes.
 *
 * This module is config-free and side-effect-free (it only builds pure derived
 * lookup maps at load time), so it can be imported by:
 *  - permission enforcement (api/src/misc/utils/permissions.ts)
 *  - API doc generation (api/contract/*)
 *  - the permission editor UI (ui/src/components/permissions/*)
 *
 * See docs/architecture/permissions-operations-source-of-truth.md for the design.
 */

export type Locale = 'fr' | 'en'
export type LocalizedLabel = Record<Locale, string>

/**
 * Normalised boolean view of a dataset's shape — the single place the dataset-type
 * conditionals are derived.
 */
export interface DatasetContext {
  isRest: boolean
  isVirtual: boolean
  isMetaOnly: boolean
  /** file-type dataset, i.e. none of virtual/rest/meta-only — the shape that exposes file routes. */
  isFile: boolean
  hasHistory: boolean
  hasLineOwnership: boolean
  hasExtensions: boolean
  hasMasterData: boolean
  hasReadApiKey: boolean
}

/**
 * Which grouping an operation belongs to:
 *  - 'class'      => a standard permission class (list/read/.../admin) — grantable per class
 *  - 'ownerAdmin' => only an owner's organization admin holds it (e.g. manageMasterData)
 *  - 'contrib'    => contributor-level capability on the owner org (e.g. post = create)
 *  - 'documented' => has a documented route but is not independently grantable (covered by another
 *                    grantable operation, e.g. getValuesLabels, downloadConvertedData, readThumbnail);
 *                    carried here so the doc generator can gate + filter its route from this list.
 *  - 'superadmin' => only reachable in admin mode (diagnose, reindex, ...); never grantable.
 */
export type OperationGrouping = 'class' | 'ownerAdmin' | 'contrib' | 'documented' | 'superadmin'

export interface OperationDescriptor {
  id: string
  resourceType: ResourceType
  /** permission class key, or a pseudo-class for ownerAdmin/contrib groupings. */
  class: string
  grouping: OperationGrouping
  title?: LocalizedLabel
  description?: LocalizedLabel
  operationType?: string
  /** deprecated routes are kept enforceable but never documented. */
  deprecated?: boolean
  /** a permission variant with no route of its own (e.g. writeDescriptionBreaking). */
  routeless?: boolean
  /**
   * Other grantable operationIds that ALSO grant access to this operation's route — i.e. holding
   * any of them is enough to see/call the route (e.g. writeDescription is also granted by
   * writeDescriptionBreaking; the getValuesLabels route is granted by getValues). Consumed by the
   * contextual doc filter to decide route visibility.
   */
  grantedByAlts?: string[]
  /** dataset-type gating; when omitted the operation applies to every dataset. */
  appliesTo?: (ctx: DatasetContext) => boolean
}

// --- Operation descriptors ---

// Helper: expand a class -> ids map into descriptors, applying per-id overrides.
type OpOverride = Partial<Omit<OperationDescriptor, 'id' | 'resourceType' | 'class' | 'grouping'>>
const expand = (
  resourceType: ResourceType,
  byClass: Record<string, string[]>,
  overrides: Record<string, OpOverride> = {},
  grouping: OperationGrouping = 'class'
): OperationDescriptor[] => {
  const descriptors: OperationDescriptor[] = []
  for (const cl of Object.keys(byClass)) {
    for (const id of byClass[cl]) {
      descriptors.push({ id, resourceType, class: cl, grouping, ...overrides[id] })
    }
  }
  return descriptors
}

const L = (fr: string, en: string): LocalizedLabel => ({ fr, en })

// Dataset-shape applicability predicates (mirror the contract's dataset-type gating).
const isFileDataset = (c: DatasetContext) => c.isFile
const notMetaOnly = (c: DatasetContext) => !c.isMetaOnly
const onlyRest = (c: DatasetContext) => c.isRest
const withHistory = (c: DatasetContext) => c.isRest && c.hasHistory
const withLineOwnership = (c: DatasetContext) => c.hasLineOwnership
// revisions of own lines exist only when the dataset also keeps history (mirrors the contract:
// the /own/{owner}/.../revisions routes are cloned from the history-gated revision routes).
const withLineOwnershipHistory = (c: DatasetContext) => c.hasLineOwnership && c.hasHistory
const withExtensions = (c: DatasetContext) => c.hasExtensions
const withMasterData = (c: DatasetContext) => c.hasMasterData
const withReadApiKey = (c: DatasetContext) => c.hasReadApiKey

const datasetOverrides: Record<string, OpOverride> = {
  list: { title: L('Lister les jeux de données', 'List datasets') },
  readDescription: { title: L('Lire les informations', 'Read metadata') },
  readSchema: { title: L('Lire le schéma', 'Read the schema'), appliesTo: notMetaOnly },
  readSafeSchema: { title: L('Lire le schéma réduit', 'Read the reduced schema'), appliesTo: notMetaOnly },
  readLines: { title: L('Lire les lignes', 'Read the lines'), appliesTo: notMetaOnly },
  getGeoAgg: { title: L('Agréger spatialement', 'Spatial aggregation'), appliesTo: notMetaOnly },
  getValuesAgg: { title: L('Agréger les valeurs', 'Aggregate values'), appliesTo: notMetaOnly },
  getValues: { title: L('Lister les valeurs distinctes', 'List distinct values'), appliesTo: notMetaOnly },
  getMetricAgg: { title: L('Calculer une métrique', 'Compute a metric'), appliesTo: notMetaOnly },
  getSimpleMetricsAgg: { title: L('Calculer des métriques simples', 'Compute simple metrics'), appliesTo: notMetaOnly },
  getWordsAgg: { title: L('Lister les mots significatifs', 'List significant words'), appliesTo: notMetaOnly },
  getMinAgg: { title: L('Calculer le minimum', 'Compute the minimum'), deprecated: true },
  getMaxAgg: { title: L('Calculer le maximum', 'Compute the maximum'), deprecated: true },
  downloadOriginalData: { title: L('Télécharger', 'Download'), appliesTo: isFileDataset },
  downloadFullData: { title: L('Télécharger (données enrichies)', 'Download (enriched data)'), appliesTo: isFileDataset },
  readApiDoc: { title: L('Obtenir la documentation OpenAPI', 'Get the OpenAPI documentation') },
  'realtime-transactions': { title: L('Suivre les transactions en temps réel', 'Track transactions in real time'), appliesTo: onlyRest },
  readLine: { title: L('Récupérer une ligne', 'Get a line'), appliesTo: onlyRest },
  readLineRevisions: { title: L("Récupérer les révisions d'une ligne", "Get a line's revisions"), appliesTo: withHistory },
  readRevisions: { title: L('Récupérer les révisions', 'Get the revisions'), appliesTo: withHistory },
  bulkSearch: { title: L('Recherche en masse (données de référence)', 'Bulk search (master-data)'), appliesTo: withMasterData },
  listDataFiles: { title: L('Lister les fichiers', 'List the files'), appliesTo: isFileDataset },
  downloadDataFile: { title: L('Télécharger un fichier', 'Download a file'), appliesTo: isFileDataset },
  downloadMetadataAttachment: { title: L('Télécharger une pièce jointe de métadonnée', 'Download a metadata attachment') },
  downloadAttachment: { title: L('Télécharger une pièce jointe', 'Download an attachment') },
  getReadApiKey: { title: L("Obtenir la clé d'API de lecture", 'Get the read API key'), appliesTo: withReadApiKey },
  readCompatODSRecords: { title: L('Récupérer les enregistrements (compatibilité ODS)', 'Get records (ODS compatibility)') },
  readCompatODSExports: { title: L('Exporter les données (compatibilité ODS)', 'Export data (ODS compatibility)') },

  readJournal: { title: L('Lister les événements', 'List the events') },
  'realtime-journal': { title: L('Suivre le journal en temps réel', 'Track the journal in real time') },
  'realtime-task-progress': { title: L('Suivre la progression des tâches en temps réel', 'Track task progress in real time') },
  readPrivateApiDoc: { title: L('Obtenir la documentation privée OpenAPI', 'Get the private OpenAPI documentation') },

  writeDescription: { title: L('Modifier le jeu de données', 'Update the dataset'), grantedByAlts: ['writeDescriptionBreaking'] },
  writeDescriptionBreaking: { title: L('Modifier avec rupture de compatibilité', 'Update with breaking changes'), routeless: true },
  writeData: { title: L('Mettre à jour les données', 'Update the data'), appliesTo: isFileDataset },
  createLine: { title: L('Ajouter une ligne', 'Add a line'), appliesTo: onlyRest },
  updateLine: { title: L('Remplacer une ligne', 'Replace a line'), appliesTo: onlyRest },
  patchLine: { title: L('Modifier une ligne', 'Patch a line'), appliesTo: onlyRest },
  bulkLines: { title: L('Effectuer des opérations en masse', 'Perform bulk operations'), appliesTo: onlyRest },
  deleteLine: { title: L('Supprimer une ligne', 'Delete a line'), appliesTo: onlyRest },
  deleteAllLines: { title: L('Supprimer toutes les lignes', 'Delete all lines'), appliesTo: onlyRest },
  validateDraft: { title: L('Valider le brouillon', 'Validate the draft'), appliesTo: isFileDataset },
  cancelDraft: { title: L('Annuler le brouillon', 'Cancel the draft'), appliesTo: isFileDataset },
  postMetadataAttachment: { title: L('Charger une pièce jointe', 'Upload an attachment') },
  deleteMetadataAttachment: { title: L('Supprimer une pièce jointe', 'Delete an attachment') },
  sendUserNotification: { title: L('Envoyer une notification', 'Send a notification'), grantedByAlts: ['sendUserNotificationPublic'] },
  sendUserNotificationPublic: { title: L('Envoyer une notification (visibilité externe)', 'Send a notification (external visibility)'), routeless: true },
  simulateExtension: { title: L('Simuler les extensions', 'Simulate the extensions'), appliesTo: withExtensions },

  readOwnLines: { title: L('Lire ses propres lignes', 'Read own lines'), appliesTo: withLineOwnership },
  readOwnLine: { title: L('Récupérer une de ses lignes', 'Get one of own lines'), appliesTo: withLineOwnership },
  createOwnLine: { title: L('Ajouter une de ses lignes', 'Add an own line'), appliesTo: withLineOwnership },
  updateOwnLine: { title: L('Remplacer une de ses lignes', 'Replace an own line'), appliesTo: withLineOwnership },
  patchOwnLine: { title: L('Modifier une de ses lignes', 'Patch an own line'), appliesTo: withLineOwnership },
  bulkOwnLines: { title: L('Opérations en masse sur ses lignes', 'Bulk operations on own lines'), appliesTo: withLineOwnership },
  deleteOwnLine: { title: L('Supprimer une de ses lignes', 'Delete an own line'), appliesTo: withLineOwnership },
  readOwnLineRevisions: { title: L("Récupérer les révisions d'une de ses lignes", 'Get revisions of an own line'), appliesTo: withLineOwnershipHistory },
  readOwnRevisions: { title: L('Récupérer les révisions de ses lignes', 'Get revisions of own lines'), appliesTo: withLineOwnershipHistory },

  delete: { title: L('Supprimer le jeu de données', 'Delete the dataset') },
  getPermissions: { title: L('Lire les permissions', 'Read the permissions') },
  setPermissions: { title: L('Modifier les permissions', 'Update the permissions') },
  changeOwner: { title: L('Changer le propriétaire', 'Change the owner') },
  writePublications: { title: L('Gérer les publications', 'Manage publications') },
  writePublicationSites: { title: L('Gérer les sites de publication', 'Manage publication sites') },
  writeExports: { title: L('Gérer les exports', 'Manage exports') },
  setReadApiKey: { title: L("Gérer la clé d'API de lecture", 'Manage the read API key') },
  readIntegrity: { title: L("Lire l'état d'intégrité", 'Read the integrity state') },
  readIntegrityRevisions: { title: L("Lister les révisions d'intégrité", 'List the integrity revisions') },
  'realtime-integrity': { title: L("Suivre l'état d'intégrité en temps réel", 'Track the integrity state in real time') },

  manageMasterData: { title: L('Utiliser comme données de référence', 'Use as master-data'), routeless: true },
  post: { title: L('Créer un jeu de données', 'Create a dataset') },

  // documented-but-not-grantable routes (each granted by a grantable operation); listed so the doc
  // generator can gate their route by dataset shape and filter it, all from the same source of truth.
  downloadConvertedData: { title: L('Télécharger (format converti)', 'Download (converted format)'), appliesTo: isFileDataset, grantedByAlts: ['downloadOriginalData'] },
  getValuesLabels: { title: L('Lister les valeurs avec libellés', 'List values with labels'), appliesTo: notMetaOnly, grantedByAlts: ['getValues'] },
  readThumbnail: { title: L('Récupérer la vignette', 'Get the thumbnail'), grantedByAlts: ['readDescription'] },

  // superadmin-only routes (reachable in admin mode only, never grantable through permissions)
  diagnose: { title: L('Lire les informations techniques', 'Read technical information') },
  reindex: { title: L('Forcer la réindexation', 'Force reindexing') },
  refinalize: { title: L('Forcer la refinalisation', 'Force refinalization') },
  syncAttachmentsLines: { title: L('Forcer la resynchronisation', 'Force resynchronization') },
  deleteLocks: { title: L('Supprimer les locks', 'Delete the locks') },
  writeIntegrity: { title: L("Activer/désactiver le contrôle d'intégrité", 'Enable/disable integrity checking') },
  checkIntegrity: { title: L("Contrôler l'intégrité", 'Run an integrity check') },
  fixIntegrity: { title: L("Réconcilier l'intégrité", 'Reconcile integrity') }
}

const datasetOperations: OperationDescriptor[] = [
  ...expand('datasets', {
    list: ['list'],
    read: ['readDescription', 'readSchema', 'readSafeSchema', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getValues', 'getMetricAgg', 'getSimpleMetricsAgg', 'getWordsAgg', 'getMinAgg', 'getMaxAgg', 'downloadOriginalData', 'downloadFullData', 'readApiDoc', 'realtime-transactions', 'readLine', 'readLineRevisions', 'readRevisions', 'bulkSearch', 'listDataFiles', 'downloadDataFile', 'downloadMetadataAttachment', 'downloadAttachment', 'getReadApiKey', 'readCompatODSRecords', 'readCompatODSExports'],
    readAdvanced: ['readJournal', 'realtime-journal', 'realtime-task-progress', 'readPrivateApiDoc'],
    write: ['writeDescription', 'writeDescriptionBreaking', 'writeData', 'createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines', 'validateDraft', 'cancelDraft', 'postMetadataAttachment', 'deleteMetadataAttachment', 'sendUserNotification', 'sendUserNotificationPublic', 'simulateExtension'],
    manageOwnLines: ['readOwnLines', 'readOwnLine', 'createOwnLine', 'updateOwnLine', 'patchOwnLine', 'bulkOwnLines', 'deleteOwnLine', 'readOwnLineRevisions', 'readOwnRevisions'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'changeOwner', 'writePublications', 'writePublicationSites', 'writeExports', 'setReadApiKey', 'readIntegrity', 'readIntegrityRevisions', 'realtime-integrity']
  }, datasetOverrides),
  ...expand('datasets', { manageMasterData: ['manageMasterData'] }, datasetOverrides, 'ownerAdmin'),
  ...expand('datasets', { post: ['post'] }, datasetOverrides, 'contrib'),
  ...expand('datasets', { documented: ['downloadConvertedData', 'getValuesLabels', 'readThumbnail'] }, datasetOverrides, 'documented'),
  ...expand('datasets', { superadmin: ['diagnose', 'reindex', 'refinalize', 'syncAttachmentsLines', 'deleteLocks', 'writeIntegrity', 'checkIntegrity', 'fixIntegrity'] }, datasetOverrides, 'superadmin')
]

const applicationOverrides: Record<string, OpOverride> = {
  list: { title: L('Lister les applications', 'List applications') },
  readDescription: { title: L('Lire les informations', 'Read metadata') },
  readConfig: { title: L('Lire la configuration actuelle', 'Read the current configuration') },
  readApiDoc: { title: L('Obtenir la documentation OpenAPI', 'Get the OpenAPI documentation') },
  readBaseApp: { title: L("Lire l'application de base", 'Read the base application') },
  readCapture: { title: L('Générer une capture PNG', 'Generate a PNG capture') },
  readPrint: { title: L('Générer une impression PDF', 'Generate a PDF print') },
  downloadAttachment: { title: L('Télécharger une pièce jointe', 'Download an attachment') },
  readJournal: { title: L('Lister les événements', 'List the events') },
  'realtime-draft-error': { title: L('Suivre les erreurs du brouillon en temps réel', 'Track draft errors in real time') },
  writeDescription: { title: L("Modifier l'application", 'Update the application') },
  writeConfig: { title: L('Modifier la configuration', 'Update the configuration') },
  postAttachment: { title: L('Charger une pièce jointe', 'Upload an attachment') },
  deleteAttachment: { title: L('Supprimer une pièce jointe', 'Delete an attachment') },
  delete: { title: L("Supprimer l'application", 'Delete the application') },
  getPermissions: { title: L('Lire les permissions', 'Read the permissions') },
  setPermissions: { title: L('Modifier les permissions', 'Update the permissions') },
  getKeys: { title: L('Lire les clés', 'Read the keys') },
  setKeys: { title: L('Modifier les clés', 'Update the keys') },
  writePublications: { title: L('Gérer les publications', 'Manage publications') },
  writePublicationSites: { title: L('Gérer les sites de publication', 'Manage publication sites') },
  post: { title: L('Créer une application', 'Create an application') }
}

const applicationOperations: OperationDescriptor[] = [
  ...expand('applications', {
    list: ['list'],
    read: ['readDescription', 'readConfig', 'readApiDoc', 'readBaseApp', 'readCapture', 'readPrint', 'downloadAttachment'],
    readAdvanced: ['readJournal', 'realtime-draft-error'],
    write: ['writeDescription', 'writeConfig', 'postAttachment', 'deleteAttachment'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'getKeys', 'setKeys', 'writePublications', 'writePublicationSites']
  }, applicationOverrides),
  ...expand('applications', { post: ['post'] }, applicationOverrides, 'contrib')
]

export const operations: OperationDescriptor[] = [...datasetOperations, ...applicationOperations]

// --- Derived lookup maps (built once at load, pure) ---

export const operationsByResource: Record<ResourceType, OperationDescriptor[]> = {
  datasets: datasetOperations,
  applications: applicationOperations,
  'remote-services': []
}

const emptyByResource = <T> (factory: () => T): Record<ResourceType, T> => ({
  datasets: factory(),
  applications: factory(),
  'remote-services': factory()
})

/** class -> operationIds, restricted to the standard (grouping === 'class') operations. */
export const operationsClasses: Record<ResourceType, Record<string, string[]>> = emptyByResource(() => ({}))
/** operationId -> class, for standard operations only. */
export const classByOperation: Record<ResourceType, Record<string, string>> = emptyByResource(() => ({}))
/** operationIds reserved to the owner organization's admins (e.g. manageMasterData). */
export const adminOperationsClasses: Record<ResourceType, string[]> = emptyByResource(() => [])
/** contributor-level operationIds (e.g. post). */
export const contribOperationsClasses: Record<ResourceType, string[]> = emptyByResource(() => [])

for (const op of operations) {
  if (op.grouping === 'class') {
    ;(operationsClasses[op.resourceType][op.class] ||= []).push(op.id)
    classByOperation[op.resourceType][op.id] = op.class
  } else if (op.grouping === 'ownerAdmin') {
    adminOperationsClasses[op.resourceType].push(op.id)
  } else if (op.grouping === 'contrib') {
    contribOperationsClasses[op.resourceType].push(op.id)
  }
}

// --- Dataset context + applicability helpers ---

export const datasetContext = (ds: Dataset): DatasetContext => {
  const anyDs = ds as any
  return {
    isRest: !!anyDs.isRest,
    isVirtual: !!anyDs.isVirtual,
    isMetaOnly: !!anyDs.isMetaOnly,
    isFile: !anyDs.isVirtual && !anyDs.isRest && !anyDs.isMetaOnly,
    hasHistory: !!anyDs.rest?.history,
    hasLineOwnership: !!anyDs.rest?.lineOwnership,
    hasExtensions: !!anyDs.extensions?.length,
    hasMasterData: !!(anyDs.masterData?.bulkSearchs?.length || anyDs.masterData?.singleSearchs?.length),
    hasReadApiKey: !!anyDs.readApiKey?.active
  }
}

/** Operations applicable to a given resource (and, for datasets, a given dataset shape). */
export const operationsFor = (resourceType: ResourceType, ctx?: DatasetContext): OperationDescriptor[] =>
  operationsByResource[resourceType].filter((op) => !ctx || !op.appliesTo || op.appliesTo(ctx))

const datasetById: Record<string, OperationDescriptor> = {}
for (const op of datasetOperations) datasetById[op.id] = op

/**
 * Whether a dataset operation's route should exist for a given dataset shape.
 * Used by the API doc generator to gate routes from the same source of truth that drives the picker.
 * Operations with no descriptor or no appliesTo predicate are always applicable.
 */
export const isDatasetOperationApplicable = (operationId: string, ctx: DatasetContext): boolean => {
  const op = datasetById[operationId]
  return !op?.appliesTo || op.appliesTo(ctx)
}

/**
 * The grantable operationIds that grant access to a dataset route (by its operationId): the operation
 * itself when it is directly grantable (or superadmin-gated), plus any grantedByAlts. Used by the
 * contextual doc filter to keep a route when the caller holds any of them. Operations unknown to the
 * source of truth fall back to requiring their own id.
 */
export const datasetOperationGrantedBy = (operationId: string): string[] => {
  const op = datasetById[operationId]
  if (!op) return [operationId]
  const granters: string[] = []
  if (op.grouping === 'class' || op.grouping === 'superadmin') granters.push(operationId)
  if (op.grantedByAlts) granters.push(...op.grantedByAlts)
  return granters
}

export interface PickerOperation { id: string, title: string }

/**
 * Permission classes -> selectable operations for the permission editor UI, localized and
 * dataset-aware. Only standard (grouping === 'class') non-deprecated operations are grantable
 * through the per-resource picker (ownerAdmin/contrib groupings and deprecated routes are excluded).
 * This lets the editor build its picker straight from the source of truth, independent of the API doc.
 */
export const permissionClassesPicker = (
  resourceType: ResourceType,
  locale: Locale,
  ctx?: DatasetContext
): Record<string, PickerOperation[]> => {
  const result: Record<string, PickerOperation[]> = {}
  for (const op of operationsFor(resourceType, ctx)) {
    if (op.grouping !== 'class' || op.deprecated) continue
    ;(result[op.class] ||= []).push({ id: op.id, title: op.title ? op.title[locale] : op.id })
  }
  return result
}
