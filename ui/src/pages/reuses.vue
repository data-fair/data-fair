<template>
  <d-frame
    id="portals-manager"
    :src="$sitePath + '/portals-manager/reuses/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/reuses/'"
    emit-iframe-messages
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
