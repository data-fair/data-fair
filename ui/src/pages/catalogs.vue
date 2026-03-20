<template>
  <d-frame
    id="catalogs"
    :src="$sitePath + '/catalogs/catalogs/'"
    :height="frameHeight"
    sync-params
    :sync-path="$sitePath + '/data-fair/catalogs/'"
    emit-iframe-messages
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, frameHeight, onMessage } = useDFramePage()
</script>
