<template>
  <d-frame
    id="dataset-api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=dataset&id=${route.params.id}`"
    sync-params
    style="height: 100%"
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script setup lang="ts">
const route = useRoute<'/dataset/[id]/api-doc'>()
const { sendUiNotif } = useUiNotif()
</script>
