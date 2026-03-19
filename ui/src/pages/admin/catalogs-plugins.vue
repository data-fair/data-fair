<template>
  <d-frame
    id="catalogs"
    :src="$sitePath + '/catalogs/admin/plugins/'"
    sync-params
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const { sendUiNotif } = useUiNotif()
</script>
