<template>
  <d-frame
    id="remote-service-api-doc"
    :src="`${$sitePath}/openapi-viewer?drawerLocation=right&urlType=remoteService&id=${route.params.id}`"
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
  remoteServices: Services interopérables
  apiDoc: Documentation API
en:
  remoteServices: Interoperable services
  apiDoc: API Documentation
</i18n>

<script setup lang="ts">
import type { RemoteService } from '#api/types'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/remote-service/[id]/api-doc'>()
const router = useRouter()
const { sendUiNotif } = useUiNotif()
const breadcrumbs = useBreadcrumbs()
const stateChangeAdapter = createStateChangeAdapter(router)

const remoteServiceFetch = useFetch<RemoteService>(`${$apiPath}/remote-services/${route.params.id}`)

watch(remoteServiceFetch.data, (remoteService) => {
  if (!remoteService) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('remoteServices'), to: '/remote-services' },
      { text: remoteService.title || route.params.id, to: `/remote-service/${route.params.id}` },
      { text: t('apiDoc') }
    ]
  })
}, { immediate: true })
</script>
