<template>
  <d-frame
    id="application-config"
    :src="`${$sitePath}/data-fair/embed/application/${route.params.id}/config`"
    resize="no"
    sync-params
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script lang="ts" setup>
const route = useRoute<'/application/[id]/config'>()
const { sendUiNotif } = useUiNotif()
</script>
