<template>
  <d-frame
    id="api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=general`"
    sync-params
    style="height: 100%"
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
