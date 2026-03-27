<template>
  <v-row v-if="dataset">
    <v-col class="my-4">
      <v-row v-if="can('writeDescriptionBreaking')">
        <v-col>
          <v-menu
            v-model="addExtensionDialog"
            :max-height="450"
          >
            <template #activator="{ props: menuProps }">
              <v-btn
                color="primary"
                v-bind="menuProps"
              >
                {{ t('addExtension') }}
              </v-btn>
            </template>

            <v-list>
              <template v-if="!availableExtensions">
                <v-skeleton-loader type="list-item-two-line" />
                <v-skeleton-loader type="list-item-two-line" />
                <v-skeleton-loader type="list-item-two-line" />
              </template>

              <template v-else>
                <v-list-item
                  v-for="extension in availableExtensions.filter(e => !e.disabled)"
                  :key="extension.id"
                  @click="dataset.extensions.push({
                    active: true,
                    type: extension.type,
                    remoteService: extension.remoteService,
                    action: extension.action.id,
                    select: defaultFields[extension.action.id] || [],
                    overwrite: {}
                  })"
                >
                  <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
                  <v-list-item-subtitle>{{ extension.linkInfo }}</v-list-item-subtitle>
                </v-list-item>
                <v-list-item
                  v-for="extension in availableExtensions.filter(e => e.disabled)"
                  :key="extension.id"
                  disabled
                >
                  <v-list-item-title>{{ extension.action.summary }}</v-list-item-title>
                  <v-list-item-subtitle>{{ extension.disabled }}</v-list-item-subtitle>
                </v-list-item>
              </template>
            </v-list>
          </v-menu>

          <br>

          <v-btn
            color="primary"
            class="mt-2"
            @click="addPropertyDialog = true"
          >
            {{ t('addExprEvalExtension') }}
          </v-btn>

          <dataset-add-property-dialog
            v-model="addPropertyDialog"
            :schema="dataset.schema"
            @add="property => dataset.extensions.push({
              active: true,
              type: 'exprEval',
              expr: '',
              property
            })"
          />
        </v-col>
      </v-row>

      <v-row
        v-if="dataset.extensions"
        class="mt-0"
      >
        <v-col
          v-for="(extension, idx) in dataset.extensions"
          :key="idx"
          cols="12"
          md="6"
        >
          <v-card height="100%">
            <template v-if="extension.type === 'remoteService'">
              <template v-if="remoteServicesMap[extension.remoteService]?.actions[extension.action]">
                <v-card-title>
                  {{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }}
                </v-card-title>
                <v-card-text style="margin-bottom: 40px;">
                  {{ t('link', { info: extensionLinkInfo(extension) }) }}
                  <v-autocomplete
                    v-if="selectFields[extension.remoteService + '_' + extension.action]?.fieldsAndTags"
                    v-model="extension.select"
                    :disabled="!can('writeDescriptionBreaking')"
                    :items="selectFields[extension.remoteService + '_' + extension.action].fieldsAndTags"
                    item-value="name"
                    item-title="title"
                    :label="t('additionalCols')"
                    multiple
                    :placeholder="t('allColsOut')"
                    persistent-hint
                    chips
                    closable-chips
                  />
                  <v-btn
                    variant="text"
                    @click="showOverwrite = showOverwrite === idx ? null : idx"
                  >
                    {{ t('overwriteKeys') }}
                    <v-icon :icon="showOverwrite === idx ? mdiChevronUp : mdiChevronDown" />
                  </v-btn>
                  <div v-show="showOverwrite === idx">
                    <div
                      v-for="propKey of extension.select?.length ? extension.select : selectFields[extension.remoteService + '_' + extension.action]?.fieldsAndTags?.map((p: any) => p.name).filter(Boolean)"
                      :key="propKey"
                    >
                      <v-text-field
                        :label="propKey"
                        :model-value="extension.overwrite?.[propKey]?.['x-originalName']"
                        :placeholder="extension.propertyPrefix + '.' + propKey"
                        :rules="[v => validPropertyOverwrite(extension, propKey, v) || '']"
                        validate-on="eager"
                        @update:model-value="val => setOverwriteOriginalName(extension, propKey, val)"
                      />
                    </div>
                  </div>
                  <v-checkbox
                    v-if="extension.remoteService.startsWith('dataset:') && dataset.isRest"
                    v-model="extension.autoUpdate"
                    :label="t('autoUpdate')"
                  />
                </v-card-text>
                <v-card-actions style="position: absolute; bottom: 0px; width: 100%;">
                  <confirm-menu
                    v-if="can('writeDescriptionBreaking') && dataset.isRest"
                    yes-color="primary"
                    :btn-props="{ color: 'primary', icon: true }"
                    :text="t('confirmRefreshText')"
                    :tooltip="t('confirmRefreshTooltip')"
                    @confirm="emit('refresh', extension)"
                  />
                  <confirm-menu
                    v-if="can('writeDescriptionBreaking')"
                    yes-color="warning"
                    :text="t('confirmDeleteText')"
                    :tooltip="t('confirmDeleteTooltip')"
                    @confirm="removeExtension(idx)"
                  />
                </v-card-actions>
              </template>
              <template v-else>
                <v-card-text style="margin-bottom: 40px;">
                  <v-alert
                    variant="outlined"
                    type="warning"
                  >
                    {{ t('unavailableService', { service: extension.remoteService, action: extension.action?.replace?.('masterData_bulkSearch_', '') ?? extension.action }) }}
                    <br>
                    {{ t('unavailableServiceDetail') }}
                  </v-alert>
                </v-card-text>
                <v-card-actions style="position: absolute; bottom: 0px; width: 100%;">
                  <confirm-menu
                    v-if="can('writeDescriptionBreaking')"
                    yes-color="warning"
                    :text="t('confirmDeleteText')"
                    :tooltip="t('confirmDeleteTooltip')"
                    @confirm="removeExtension(idx)"
                  />
                </v-card-actions>
              </template>
            </template>
            <template v-if="extension.type === 'exprEval'">
              <v-card-title>
                {{ extension.property?.['x-originalName'] || t('newExprEval') }}
              </v-card-title>
              <v-card-text style="margin-bottom: 40px;">
                <v-text-field
                  v-model="extension.expr"
                  disabled
                  :label="t('expr')"
                  hide-details
                />
              </v-card-text>
              <v-card-actions style="position: absolute; bottom: 0px; width: 100%;">
                <confirm-menu
                  v-if="can('writeDescriptionBreaking')"
                  yes-color="warning"
                  :text="t('confirmDeleteText')"
                  :tooltip="t('confirmDeleteTooltip')"
                  @confirm="removeExtension(idx)"
                />
              </v-card-actions>
            </template>
          </v-card>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  addExtension: Ajouter des colonnes de donnees de reference
  addExprEvalExtension: Ajouter une colonne calculee
  additionalCols: Colonnes additionnelles
  allColsOut: Toutes les colonnes
  confirmDeleteTooltip: Supprimer l'extension
  confirmDeleteText: Souhaitez-vous confirmer la suppression ?
  confirmRefreshTooltip: Relancer l'enrichissement
  confirmRefreshText: Souhaitez-vous confirmer la relance de l'enrichissement ?
  extensionExists: Cette extension a deja ete configuree
  missingConcepts: "Il faut associer au moins l'un des concepts suivants a vos colonnes : {concepts}"
  newExprEval: Nouvelle colonne calculee
  expr: Expression
  autoUpdate: Mise a jour automatique si la source change
  link: "Lien : {info}"
  unavailableService: "Donnee de reference non disponible ({service} / {action})."
  unavailableServiceDetail: Soit la donnee de reference n'existe plus, soit le concept servant de liaison n'est plus present dans votre jeu de donnees.
  overwriteKeys: Surcharger les cles des colonnes
en:
  addExtension: Add columns from master-data sources
  addExprEvalExtension: Add a calculated column
  additionalCols: Additional columns
  allColsOut: All the columns
  confirmDeleteTooltip: Delete the extension
  confirmDeleteText: Do you want to confirm the deletion?
  confirmRefreshTooltip: Update extension
  confirmRefreshText: Do you want to confirm the update of the extension?
  extensionExists: This extension was already configured
  missingConcepts: "You must tag your columns with at least one of these concepts: {concepts}"
  newExprEval: New calculated column
  expr: Expression
  autoUpdate: Auto update when the source changes
  link: "Link: {info}"
  unavailableService: "Master data not available ({service} / {action})."
  unavailableServiceDetail: Either the master data no longer exists, or the linking concept is no longer present in your dataset.
  overwriteKeys: Override column keys
</i18n>

<script lang="ts" setup>
import { mdiChevronDown, mdiChevronUp } from '@mdi/js'
import { escapeKey } from '~/utils/escape-key'
import { useRemoteServices } from '~/composables/use-remote-services'
import useStore from '~/composables/use-store'

const dataset = defineModel<any>({ required: true })
const emit = defineEmits<{ refresh: [extension: any] }>()

const { t } = useI18n()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const owner = computed(() => dataset.value?.owner)
const { remoteServices, remoteServicesMap } = useRemoteServices(owner)
const { vocabulary } = useStore()

const addExtensionDialog = ref(false)
const addPropertyDialog = ref(false)
const showOverwrite = ref<number | null>(null)

const defaultFields: Record<string, string[]> = {
  findEntreprisesBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFEN'],
  findEtablissementsBulk: ['NOMEN_LONG', 'bodacc.capital', 'TEFET'],
  postCoords: ['lat', 'lon'],
  findCityBulk: ['population.popMuni', 'DEP', 'REG'],
  findParcellesBulk: ['lat', 'lon']
}

// Initialize extensions
if (dataset.value) {
  dataset.value.extensions = (dataset.value.extensions || []).filter((e: any) => e.active !== false)
}

const datasetConcepts = computed(() => new Set(
  dataset.value?.schema?.map((field: any) => field['x-refersTo']).filter((c: any) => c) ?? []
))

const availableExtensions = computed(() => {
  if (!remoteServices.value.length) return null
  if (!dataset.value?.extensions) return []
  const extensions: any[] = []
  remoteServices.value.forEach((service: any) => {
    service.actions.filter((a: any) => a.inputCollection && a.outputCollection).forEach((a: any) => {
      a.output = a.output.filter((f: any) => f.title)
      const extension: any = { type: 'remoteService', id: service.id + '--' + a.id, remoteService: service.id, action: a }
      if (dataset.value.extensions.find((e: any) => extension.id === e.remoteService + '--' + e.action)) {
        extension.disabled = t('extensionExists')
      }
      if (!extension.action.input.find((i: any) => datasetConcepts.value.has(i.concept))) {
        const missingConcepts = extension.action.input
          .filter((i: any) => i.concept !== 'http://schema.org/identifier')
          .map((i: any) => vocabulary.value[i.concept]?.title ?? 'deprecated concept')
        extension.disabled = t('missingConcepts', { concepts: missingConcepts.join(', ') })
      }
      if (!extension.disabled) extension.linkInfo = extensionLinkInfo(extension)
      extensions.push(extension)
    })
  })
  return extensions
})

const selectFields = computed(() => {
  const res: Record<string, { fields: any[], tags: string[], fieldsAndTags: any[] }> = {}
  for (const extension of dataset.value?.extensions ?? []) {
    if (extension.type !== 'remoteService') continue
    const actionData = remoteServicesMap.value[extension.remoteService]?.actions[extension.action]
    if (!actionData?.output) continue
    const fields = actionData.output
      .map((field: any) => { field['x-tags'] = field['x-tags'] || []; return field })
      .filter((f: any) => !f.concept || f.concept !== 'http://schema.org/identifier')
      .filter((f: any) => f.name !== 'error' && f.name !== '_error')
      .filter((f: any) => !f['x-calculated'])
      .sort((a: any, b: any) => (a.title || a.name).localeCompare(b.title || b.name))
    const tags = [...new Set(fields.flatMap((f: any) => f['x-tags']))].sort() as string[]
    const fieldsAndTags: any[] = []
    tags.forEach((tag: string) => {
      fieldsAndTags.push({ header: tag })
      fields.filter((field: any) => field['x-tags'].includes(tag)).forEach((field: any) => fieldsAndTags.push(field))
    })
    const noTagsFields = fields.filter((field: any) => !field['x-tags']?.length)
    if (fieldsAndTags.length > 0 && noTagsFields.length > 0) fieldsAndTags.push({ header: 'Autres' })
    noTagsFields.forEach((field: any) => fieldsAndTags.push(field))
    res[extension.remoteService + '_' + extension.action] = { fields, tags, fieldsAndTags }
  }
  return res
})

function removeExtension (idx: number) {
  dataset.value.extensions.splice(idx, 1)
}

function extensionLinkInfo (extension: { remoteService: string, action: string | { id: string } }) {
  const actionId = typeof extension.action === 'string' ? extension.action : extension.action?.id
  const actionData = remoteServicesMap.value[extension.remoteService]?.actions[actionId]
  if (!actionData?.input) return ''
  const input = actionData.input.filter((i) => i.concept !== 'http://schema.org/identifier')
  return input.map((i: any) => {
    const concept = vocabulary.value[i.concept]?.title || i.concept
    const field = dataset.value.schema.find((f: any) => f['x-refersTo'] === i.concept)
    const fieldTitle = field && (field.title || field['x-originalName'] || field.key)
    let msg = `concept ${concept}`
    if (fieldTitle) msg += ` (colonne ${fieldTitle})`
    return msg
  }).join(', ')
}

function validPropertyOverwrite (extension: any, name: string, newName: string | null) {
  newName = newName?.trim() ?? null
  if (!newName) return true
  const key = escapeKey(newName)
  return !dataset.value.schema.some((f: any) => {
    if (f['x-extension'] === extension.remoteService + '/' + extension.action) {
      if (extension.select?.includes(newName) && name !== newName) return true
      if (extension.overwrite) {
        for (const [overwriteKey, overwriteValue] of Object.entries(extension.overwrite)) {
          if (overwriteKey !== name && (overwriteValue as any)['x-originalName']?.trim() && escapeKey((overwriteValue as any)['x-originalName'].trim()) === key) return true
        }
      }
      return false
    }
    return f.key === key
  })
}

function setOverwriteOriginalName (extension: any, propKey: string, value: string) {
  value = value?.trim()
  if (value) {
    if (!extension.overwrite) extension.overwrite = {}
    if (!extension.overwrite[propKey]) extension.overwrite[propKey] = {}
    extension.overwrite[propKey]['x-originalName'] = value
  } else if (extension.overwrite?.[propKey]) {
    delete extension.overwrite[propKey]['x-originalName']
  }
}
</script>
