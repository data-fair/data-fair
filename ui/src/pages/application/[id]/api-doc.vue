<template>
  <d-frame
    id="application-api-doc"
    :src="`${$sitePath}/openapi-viewer/?drawerLocation=right&urlType=application&id=${route.params.id}`"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  apiDoc: Documentation API
en:
  applications: Applications
  apiDoc: API Documentation
</i18n>

<script setup lang="ts">
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/application/[id]/api-doc'>()
const router = useRouter()
const { sendUiNotif } = useUiNotif()
const breadcrumbs = useBreadcrumbs()
const stateChangeAdapter = createStateChangeAdapter(router)

const { application } = useApplicationStore()

watch(application, (app) => {
  if (!app) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('applications'), to: '/applications' },
      { text: app.title || app.id, to: `/application/${app.id}` },
      { text: t('apiDoc') }
    ]
  })
}, { immediate: true })
</script>
