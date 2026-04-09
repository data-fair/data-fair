<template>
  <d-frame
    id="dataset-api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=${urlType}&id=${route.params.id}`"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'
import { provideDatasetStore } from '~/composables/dataset/store'

const route = useRoute<'/dataset/[id]/api-doc'>()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const { can } = provideDatasetStore(route.params.id)
const urlType = computed(() => can('readPrivateApiDoc').value ? 'privateDataset' : 'dataset')
</script>
