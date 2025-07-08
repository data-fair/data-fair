<template lang="html">
  <v-container data-iframe-height>
    <v-alert
      v-if="dataset && !dataset.isRest"
      type="error"
    >
      Ces données ne sont pas éditables
    </v-alert>
    <v-alert
      v-else-if="dataset && !dataset.userPermissions.includes('createLine')"
      type="error"
    >
      Vous n'avez pas la permission de saisir ces données
    </v-alert>
    <template v-else-if="jsonSchemaFetch.data.value && queryContext && initialized">
      <v-form
        v-if="line"
        ref="form"
        v-model="valid"
      >
        <dataset-edit-line-form
          v-model="line"
          :own-lines="ownLinesMode"
          :readonly-cols="readonlyCols"
          :extension="extension"
          :loading="saveLine.loading.value"
          :ro-primary-key="!!existingLine"
          @on-file-upload="(f: File) => {file = f}"
        />
        <v-row>
          <v-spacer />
          <v-btn
            color="primary"
            :loading="saveLine.loading.value"
            :disabled="sent || !valid"
            @click="saveLine.execute()"
          >
            Enregistrer
          </v-btn>
          <v-spacer />
        </v-row>
      </v-form>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { VForm } from 'vuetify/components'
import { provideDatasetStore } from '~/composables/dataset-store'

useFrameContent()
const route = useRoute<'/embed/dataset/[id]/form'>()
const session = useSession()

const { dataset, restDataset, jsonSchemaFetch } = provideDatasetStore(route.params.id, false, true)
if (!jsonSchemaFetch.initialized.value) jsonSchemaFetch.refresh()

const ownLinesMode = computed(() => dataset.value?.rest?.lineOwnership)
const valid = ref(false)
const sent = ref(false)
const initialized = ref(false)
const line = ref<Record<string, any>>({})
const existingLine = ref<Record<string, any>>()
const file = ref<File>()
const extension = useBooleanSearchParam('extension')

const queryContext = computed(() => {
  if (!restDataset.value) return
  const filters: Record<string, string> = {}
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value !== 'string') continue
    if (key.endsWith('_eq')) {
      if (key.startsWith('_c_')) {
        const conceptId = key.slice(3, -3)
        const property = restDataset.value.schema.find(p => p['x-concept']?.id === conceptId)
        if (!property) {
          console.error(`property matching concept ${conceptId} not found`)
        } else {
          filters[key] = value
          data[property.key] = value
        }
      } else if (key.startsWith('_d_')) {
        const datasetPrefix: string = `_d_${restDataset.value.id}_`
        if (key.startsWith(datasetPrefix)) {
          const propertyKey = key.replace(datasetPrefix, '').slice(0, -3)
          filters[propertyKey + '_eq'] = value
          data[propertyKey] = value
        }
      } else {
        const propertyKey = key.slice(-3)
        filters[key] = value
        data[propertyKey] = value
      }
    }
  }
  return { filters, data }
})

const readonlyCols = computed(() => queryContext.value && Object.keys(queryContext.value.data))

watch(queryContext, async () => {
  if (initialized.value || !queryContext.value) return
  if (Object.keys(queryContext.value.data).length) {
    const existingLines = await $fetch<{ results: any[] }>(`/datasets/${route.params.id}/lines`, {
      query: {
        ...queryContext.value.filters,
        t: new Date().getTime()
      }
    })
    existingLine.value = existingLines.results[0]
    line.value = existingLine.value ? { ...existingLine.value } : { ...queryContext.value.data }
  }
  initialized.value = true
})

const form = useTemplateRef('form')
const saveLine = useAsyncAction(async () => {
  await form.value?.validate()
  if (!valid.value || !restDataset.value || !queryContext.value) return
  if (ownLinesMode.value) {
    const body = { ...line.value }
    if (existingLine.value) body._id = existingLine.value._id
    await $fetch(`/datasets/${route.params.id}/own/${session.account.value?.type}:${session.account.value?.id}/lines`, { method: 'POST', body })
  } else {
    const formData = new FormData()
    if (file.value) formData.append('attachment', file.value)
    restDataset.value.schema.filter(f => !f['x-calculated'] && !f['x-extension']).forEach(f => {
      if (line.value[f.key] !== null && line.value[f.key] !== undefined) formData.append(f.key, line.value[f.key])
    })
    if (existingLine.value) {
      formData.append('_id', existingLine.value._id)
      formData.append('_action', 'update')
    } else {
      formData.append('_action', 'create')
    }
    await $fetch(`/datasets/${route.params.id}/lines`, { method: 'POST', body: formData })
  }
  if (!Object.keys(queryContext.value.data).length) {
    // crowd-sourcing add mode where we don't want the user to spam
    sent.value = true
  }
}, {})

</script>
