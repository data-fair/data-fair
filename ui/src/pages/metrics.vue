<template>
  <d-frame
    id="metrics"
    :adapter.prop="stateChangeAdapter"
    src="/metrics/embed/home/"
    sync-path="/data-fair/metrics/"
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
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('metrics') }] })
</script>

<i18n lang="yaml">
fr:
  metrics: Audience
en:
  metrics: Audience
</i18n>
