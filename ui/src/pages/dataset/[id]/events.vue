<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
  >
    <d-frame
      :src="frameUrl"
      sync-params
      @notif="msg => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
    />
  </v-container>
</template>

<script lang="ts" setup>
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/events'>()

const store = provideDatasetStore(route.params.id)
const { dataset } = store
const { sendUiNotif } = useUiNotif()

useDatasetWatch(store, ['info'])

const frameUrl = computed(() => {
  if (!dataset.value) return ''
  return `${window.location.origin}/events/embed/traceability?resource=${encodeURIComponent($apiPath + '/datasets/' + dataset.value.id)}`
})

watch(dataset, (d) => {
  if (!d) return
  setBreadcrumbs([
    { text: t('datasets'), to: '/datasets' },
    { text: d.title || d.id, to: `/dataset/${d.id}` },
    { text: t('events') }
  ])
}, { immediate: true })
</script>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  events: Traçabilité
en:
  datasets: Datasets
  events: Traceability
</i18n>
