<template>
  <d-frame
    id="dataset-api-doc"
    :src="`${$sitePath}/openapi-viewer/?drawerLocation=right&urlType=${urlType}&id=${route.params.id}`"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  apiDoc: Documentation API
en:
  datasets: Datasets
  apiDoc: API Documentation
</i18n>

<script setup lang="ts">
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { useDatasetStore } from '~/composables/dataset/dataset-store'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/api-doc'>()
const router = useRouter()
const { sendUiNotif } = useUiNotif()
const breadcrumbs = useBreadcrumbs()
const stateChangeAdapter = createStateChangeAdapter(router)

const { dataset, can } = useDatasetStore()
const urlType = computed(() => can('readPrivateApiDoc').value ? 'privateDataset' : 'dataset')

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('apiDoc') }
    ]
  })
}, { immediate: true })
</script>
