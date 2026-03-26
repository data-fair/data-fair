<template>
  <d-frame
    id="api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=general`"
    sync-params
    resize="yes"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
