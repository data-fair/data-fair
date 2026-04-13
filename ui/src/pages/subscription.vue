<template>
  <d-frame
    v-if="$uiConfig.subscriptionUrl"
    id="customers-subscriptions"
    :adapter.prop="stateChangeAdapter"
    :src="$uiConfig.subscriptionUrl"
    sync-path="/data-fair/subscription/"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
</script>
