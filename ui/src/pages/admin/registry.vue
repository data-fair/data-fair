<template>
  <d-frame
    id="registry"
    :src="$sitePath + '/registry/'"
    :sync-path="$sitePath + '/admin/registry/'"
    class="fill-height"
    sync-params
    resize="no"
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
  />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
