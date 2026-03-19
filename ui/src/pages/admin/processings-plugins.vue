<template>
  <d-frame
    id="processings"
    :src="$sitePath + '/processings/admin/plugins/'"
    sync-params
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
