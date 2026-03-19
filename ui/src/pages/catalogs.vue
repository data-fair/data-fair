<template>
  <d-frame
    id="catalogs"
    :src="$sitePath + '/catalogs/catalogs/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/catalogs/'"
    emit-iframe-messages
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
