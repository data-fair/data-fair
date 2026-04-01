<template>
  <d-frame
    id="catalogs"
    :src="$sitePath + '/catalogs/catalogs/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/catalogs/'"
    emit-iframe-messages
    style="height: 100%"
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
  <RouterView />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
