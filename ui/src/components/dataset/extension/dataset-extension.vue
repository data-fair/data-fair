<template>
  <p class="mb-4">
    {{ t('intro') }}
  </p>

  <v-row
    v-if="can('writeDescriptionBreaking')"
    class="ga-2"
  >
    <dataset-extension-add-menu
      :available-extensions="availableExtensions"
      @add="extension => dataset.extensions.push(extension)"
    />

    <dataset-add-column-dialog
      :schema="dataset.schema"
      :button-label="t('addExprEvalExtension')"
      @add="column => dataset.extensions.push({
        active: true,
        type: 'exprEval',
        expr: '',
        property: column
      })"
    />
  </v-row>

  <v-row v-if="dataset.extensions">
    <v-col
      v-for="(extension, idx) in dataset.extensions"
      :key="idx"
      cols="12"
      md="6"
    >
      <dataset-extension-remote-service-card
        v-if="extension.type === 'remoteService'"
        v-model:extension="dataset.extensions[idx]"
        :dataset="dataset"
        :remote-services-map="remoteServicesMap"
        :vocabulary="vocabulary"
        :resource-url="resourceUrl"
        :can-write="can('writeDescriptionBreaking')"
        @refresh="emit('refresh', extension)"
        @remove="removeExtension(idx as number)"
      />
      <dataset-extension-expr-eval-card
        v-else-if="extension.type === 'exprEval'"
        :extension="extension"
        :idx="(idx as number)"
        :dataset="dataset"
        :resource-url="resourceUrl"
        :can-write="can('writeDescriptionBreaking')"
        @remove="removeExtension(idx as number)"
        @update:expr="val => extension.expr = val"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  intro: Enrichissez ce jeu de données en définissant des colonnes supplémentaires issues de données de référence ou calculées à partir des colonnes existantes.
  addExprEvalExtension: Ajouter une colonne calculée
  extensionExists: Cette extension a déjà été configurée
  missingConcepts: "Il faut associer au moins l'un des concepts suivants à vos colonnes : {concepts}"
en:
  intro: Enrich this dataset by defining additional columns from master data sources or calculated from existing columns.
  addExprEvalExtension: Add a calculated column
  extensionExists: This extension was already configured
  missingConcepts: "You must tag your columns with at least one of these concepts: {concepts}"
</i18n>

<script setup lang="ts">
import { useRemoteServices } from '~/composables/use-remote-services'
import useStore from '~/composables/use-store'
import DatasetExtensionAddMenu from './dataset-extension-add-menu.vue'
import DatasetExtensionRemoteServiceCard from './dataset-extension-remote-service-card.vue'
import DatasetExtensionExprEvalCard from './dataset-extension-expr-eval-card.vue'

const dataset = defineModel<any>({ required: true })
const emit = defineEmits<{ refresh: [extension: any] }>()

const { t } = useI18n()
const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const owner = computed(() => dataset.value?.owner)
const { remoteServices, remoteServicesMap } = useRemoteServices(owner)
const { vocabulary } = useStore()
const { resourceUrl } = useDatasetStore()

const datasetConcepts = computed(() => new Set(
  dataset.value?.schema?.map((field: any) => field['x-refersTo']).filter((c: any) => c) ?? []
))

const availableExtensions = computed(() => {
  if (!remoteServices.value.length) return null
  if (!dataset.value?.extensions) return []
  const extensions: any[] = []
  remoteServices.value.forEach((service: any) => {
    service.actions.filter((a: any) => a.inputCollection && a.outputCollection).forEach((a: any) => {
      const output = a.output.filter((f: any) => f.title)
      const extension: any = { type: 'remoteService', id: service.id + '--' + a.id, remoteService: service.id, action: { ...a, output } }
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
</script>
