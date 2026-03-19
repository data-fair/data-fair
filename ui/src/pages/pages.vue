<template>
  <d-frame
    id="portals-manager"
    :src="$sitePath + '/portals-manager/pages/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/pages/'"
    emit-iframe-messages
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
