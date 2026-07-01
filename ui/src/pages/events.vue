<template>
  <d-frame
    id="events"
    :adapter.prop="stateChangeAdapter"
    src="/events/embed/events/"
    sync-path="/data-fair/events/"
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
breadcrumbs.receive({ breadcrumbs: [{ text: t('events') }] })
</script>

<i18n lang="yaml">
fr:
  events: Traçabilité (bêta)
en:
  events: Traceability (beta)
</i18n>
