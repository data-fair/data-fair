<template>
  <d-frame
    id="processings"
    :src="$sitePath + '/processings/processings/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/processings/'"
    emit-iframe-messages
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
