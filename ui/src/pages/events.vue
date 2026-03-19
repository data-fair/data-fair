<template>
  <d-frame
    id="events"
    :src="$sitePath + '/events/embed/events/'"
    sync-params
    :sync-path="$sitePath + '/data-fair/events/'"
    emit-iframe-messages
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
