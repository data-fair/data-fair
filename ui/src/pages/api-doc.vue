<template>
  <d-frame
    id="api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=general`"
    sync-params
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
