<template>
  <d-frame
    id="dataset-api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=dataset&id=${route.params.id}`"
    sync-params
    resize="no"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const route = useRoute<'/dataset/[id]/api-doc'>()
const { sendUiNotif } = useUiNotif()
</script>
