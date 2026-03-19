<template>
  <d-frame
    id="metrics"
    :src="$sitePath + '/metrics/embed/home'"
    sync-params
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
