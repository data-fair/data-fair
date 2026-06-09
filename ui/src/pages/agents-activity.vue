<template>
  <d-frame
    v-if="account"
    id="agents-activity"
    :adapter.prop="stateChangeAdapter"
    :src="`/agents/${account.type}/${account.id}/activity`"
    sync-path="/data-fair/agents-activity/"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
  />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
const session = useSession()
const account = computed(() => session.account.value)
</script>
