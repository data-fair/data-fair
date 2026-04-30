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
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('subscription') }] })
</script>

<i18n lang="yaml">
fr:
  subscription: Abonnement
en:
  subscription: Subscription
</i18n>
