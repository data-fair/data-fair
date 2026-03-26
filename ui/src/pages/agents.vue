<template>
  <d-frame
    id="agents"
    :src="`${$sitePath}/agents/${session.account.value.type}/${session.account.value.id}/settings`"
    sync-params
    :sync-path="$sitePath + '/data-fair/agents/'"
    emit-iframe-messages
    resize="yes"
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
  <RouterView />
</template>

<script lang="ts" setup>
import { useDFramePage } from '~/composables/use-d-frame-page'

const session = useSessionAuthenticated()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
