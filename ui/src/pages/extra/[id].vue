<template>
  <template v-if="extra">
    <d-frame
      v-if="iframeUrl"
      :id="`extra-${route.params.id}`"
      :src="iframeUrl"
      class="fill-height"
      resize="no"
      sync-params
      sync-path="#"
      emit-iframe-messages
      :adapter.prop="stateChangeAdapter"
      @message="onMessage"
      @iframe-message="onMessage"
      @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
    />
  </template>
  <v-container v-else>
    <v-alert type="error">
      {{ t('unknownPage', { id: route.params.id }) }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/extra/[id]'>()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter } = useDFramePage()
const breadcrumbs = useBreadcrumbs()

const extra = computed(() => {
  return $uiConfig.extraNavigationItems.find((e: any) => e.id === route.params.id)
})

const iframeUrl = computed(() => {
  if (!extra.value?.iframe) return null
  return new URL(extra.value.iframe, window.location.href).href
})

function getBreadcrumbPath (iframePath: string) {
  if (!extra.value?.iframe) return null
  const base = new URL(extra.value.iframe, window.location.href).pathname
  const relative = iframePath.startsWith(base) ? iframePath.slice(base.length) : iframePath
  return `/extra/${route.params.id}#${relative}`
}

function onMessage (message: { detail?: Record<string, unknown> } & Record<string, unknown>) {
  const detail = (message?.detail ?? message) as any
  if (!detail?.breadcrumbs) return
  const crumbs = detail.breadcrumbs.map((b: any) => ({
    text: b.text,
    to: b.to ? getBreadcrumbPath(b.to) : undefined
  }))
  breadcrumbs.receive({ breadcrumbs: crumbs })
}

onMounted(() => {
  if (extra.value) {
    breadcrumbs.receive({ breadcrumbs: [{ text: extra.value.title || route.params.id as string }] })
  }
})
</script>

<i18n lang="yaml">
fr:
  unknownPage: Page inconnue {id}
en:
  unknownPage: Unknown page {id}
</i18n>
