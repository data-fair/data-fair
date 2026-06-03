<template>
  <d-frame
    id="api-doc"
    :src="`${$sitePath}/openapi-viewer/?drawerLocation=right&urlType=general`"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
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
breadcrumbs.receive({ breadcrumbs: [{ text: t('apiDoc') }] })
</script>

<i18n lang="yaml">
fr:
  apiDoc: Documentation d'API
en:
  apiDoc: API Documentation
</i18n>
