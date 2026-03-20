<template>
  <d-frame
    id="portals-manager"
    :src="$sitePath + '/portals-manager/pages/'"
    :height="frameHeight"
    sync-params
    :sync-path="$sitePath + '/data-fair/pages/'"
    emit-iframe-messages
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
  <RouterView />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, frameHeight, onMessage } = useDFramePage()
</script>
