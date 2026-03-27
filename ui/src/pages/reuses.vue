<template>
  <d-frame
    id="portals-manager"
    :src="$sitePath + '/portals-manager/reuses/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/reuses/'"
    emit-iframe-messages
    resize="yes"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
  <RouterView />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
