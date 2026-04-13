<template>
  <v-card height="100%">
    <template v-if="actionData">
      <v-card-title>
        {{ actionData.summary }}
      </v-card-title>
      <v-card-text>
        {{ t('link', { info: linkInfo }) }}
        <v-autocomplete
          v-if="selectFieldsData?.fieldsAndTags"
          v-model="extension.select"
          :label="t('additionalCols')"
          :placeholder="t('allColsOut')"
          :disabled="!canWrite"
          :items="selectFieldsData.fieldsAndTags"
          item-value="name"
          item-title="title"
          class="mt-2"
          chips
          multiple
          closable-chips
          persistent-hint
          hide-details
        />
        <v-btn
          :append-icon="showOverwrite ? mdiChevronUp : mdiChevronDown"
          variant="text"
          @click="showOverwrite = !showOverwrite"
        >
          {{ t('overwriteKeys') }}
        </v-btn>
        <div v-show="showOverwrite">
          <div
            v-for="propKey of overwriteKeys"
            :key="propKey"
          >
            <v-text-field
              :label="propKey"
              :model-value="extension.overwrite?.[propKey]?.['x-originalName']"
              :placeholder="extension.propertyPrefix + '.' + propKey"
              :rules="[v => validPropertyOverwrite(propKey, v) || '']"
              validate-on="eager"
              @update:model-value="val => setOverwriteOriginalName(propKey, val)"
            />
          </div>
        </div>
        <v-checkbox
          v-if="extension.remoteService.startsWith('dataset:') && dataset.isRest"
          v-model="extension.autoUpdate"
          :label="t('autoUpdate')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <confirm-menu
          v-if="canWrite && dataset.isRest"
          :title="t('confirmRefreshTitle')"
          :text="t('confirmRefreshText')"
          :tooltip="t('confirmRefreshTooltip')"
          yes-color="primary"
          :btn-props="{ color: 'primary', icon: true }"
          :icon="mdiRefresh"
          @confirm="emit('refresh')"
        />
        <dataset-extension-details-dialog
          :extension="extension"
          :dataset="dataset"
          :remote-services-map="remoteServicesMap"
          :resource-url="resourceUrl"
        />
        <confirm-menu
          v-if="canWrite"
          :title="t('confirmDeleteTitle')"
          :text="t('confirmDeleteText')"
          :tooltip="t('confirmDeleteTooltip')"
          yes-color="warning"
          @confirm="emit('remove')"
        />
      </v-card-actions>
    </template>
    <template v-else>
      <v-card-text>
        <v-alert
          variant="outlined"
          type="warning"
        >
          {{ t('unavailableService', { service: extension.remoteService, action: extension.action?.replace?.('masterData_bulkSearch_', '') ?? extension.action }) }}
          <br>
          {{ t('unavailableServiceDetail') }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <confirm-menu
          v-if="canWrite"
          :title="t('confirmDeleteTitle')"
          :text="t('confirmDeleteText')"
          :tooltip="t('confirmDeleteTooltip')"
          yes-color="warning"
          @confirm="emit('remove')"
        />
      </v-card-actions>
    </template>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  additionalCols: Colonnes additionnelles
  allColsOut: Toutes les colonnes
  confirmDeleteTooltip: Supprimer l'extension
  confirmDeleteTitle: Supprimer l'extension
  confirmDeleteText: Êtes-vous sûr de vouloir supprimer cette extension ? Les colonnes ajoutées par cet enrichissement seront supprimées.
  confirmRefreshTooltip: Relancer l'enrichissement
  confirmRefreshTitle: Relancer l'enrichissement
  confirmRefreshText: Souhaitez-vous relancer l'enrichissement ? Les données enrichies seront recalculées.
  link: "Lien : {info}"
  unavailableService: "donnée de référence non disponible ({service} / {action})."
  unavailableServiceDetail: Soit la donnée de référence n'existe plus, soit le concept servant de liaison n'est plus présent dans votre jeu de données.
  overwriteKeys: Surcharger les clés des colonnes
  autoUpdate: Mise à jour automatique si la source change
en:
  additionalCols: Additional columns
  allColsOut: All the columns
  confirmDeleteTooltip: Delete the extension
  confirmDeleteTitle: Delete the extension
  confirmDeleteText: Are you sure you want to delete this extension? The columns added by this enrichment will be removed.
  confirmRefreshTooltip: Update extension
  confirmRefreshTitle: Update extension
  confirmRefreshText: Do you want to update the extension? The enriched data will be recalculated.
  link: "Link: {info}"
  unavailableService: "Master data not available ({service} / {action})."
  unavailableServiceDetail: Either the master data no longer exists, or the linking concept is no longer present in your dataset.
  overwriteKeys: Override column keys
  autoUpdate: Auto update when the source changes
</i18n>

<script setup lang="ts">
import { mdiChevronDown, mdiChevronUp, mdiRefresh } from '@mdi/js'
import { escapeKey } from '~/utils/escape-key'
import DatasetExtensionDetailsDialog from './dataset-extension-details-dialog.vue'

const extension = defineModel<any>('extension', { required: true })

const props = defineProps<{
  dataset: any
  remoteServicesMap: any
  vocabulary: any
  resourceUrl: string
  canWrite: boolean
}>()

const emit = defineEmits<{ refresh: [], remove: [] }>()

const { t } = useI18n()

const showOverwrite = ref(false)

const actionData = computed(() =>
  props.remoteServicesMap[extension.value.remoteService]?.actions[extension.value.action]
)

const linkInfo = computed(() => {
  if (!actionData.value?.input) return ''
  const input = actionData.value.input.filter((i: any) => i.concept !== 'http://schema.org/identifier')
  return input.map((i: any) => {
    const concept = props.vocabulary[i.concept]?.title || i.concept
    const field = props.dataset.schema.find((f: any) => f['x-refersTo'] === i.concept)
    const fieldTitle = field && (field.title || field['x-originalName'] || field.key)
    let msg = `concept ${concept}`
    if (fieldTitle) msg += ` (colonne ${fieldTitle})`
    return msg
  }).join(', ')
})

const selectFieldsData = computed(() => {
  if (!actionData.value?.output) return null
  const fields = actionData.value.output
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
  return { fields, tags, fieldsAndTags }
})

const overwriteKeys = computed(() =>
  extension.value.select?.length
    ? extension.value.select
    : selectFieldsData.value?.fieldsAndTags?.map((p: any) => p.name).filter(Boolean)
)

function validPropertyOverwrite (name: string, newName: string | null) {
  newName = newName?.trim() ?? null
  if (!newName) return true
  const key = escapeKey(newName)
  return !props.dataset.schema.some((f: any) => {
    if (f['x-extension'] === extension.value.remoteService + '/' + extension.value.action) {
      if (extension.value.select?.includes(newName) && name !== newName) return true
      if (extension.value.overwrite) {
        for (const [overwriteKey, overwriteValue] of Object.entries(extension.value.overwrite)) {
          if (overwriteKey !== name && (overwriteValue as any)['x-originalName']?.trim() && escapeKey((overwriteValue as any)['x-originalName'].trim()) === key) return true
        }
      }
      return false
    }
    return f.key === key
  })
}

function setOverwriteOriginalName (propKey: string, value: string) {
  value = value?.trim()
  if (value) {
    if (!extension.value.overwrite) extension.value.overwrite = {}
    if (!extension.value.overwrite[propKey]) extension.value.overwrite[propKey] = {}
    extension.value.overwrite[propKey]['x-originalName'] = value
  } else if (extension.value.overwrite?.[propKey]) {
    delete extension.value.overwrite[propKey]['x-originalName']
  }
}
</script>
