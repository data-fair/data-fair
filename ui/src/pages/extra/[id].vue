<template>
  <template v-if="extra">
    <iframe
      v-if="iframeUrl"
      :src="iframeUrl"
      width="100%"
      style="height: 100%; border: none;"
    />
  </template>
  <v-container v-else>
    <v-alert type="error">
      {{ t('unknownPage', { id: route.params.id }) }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/extra/[id]'>()
const breadcrumbs = useBreadcrumbs()

const extra = computed(() => {
  return $uiConfig.extraNavigationItems.find(e => e.id === route.params.id)
})

const iframeUrl = computed(() => {
  if (!extra.value?.iframe) return null
  return new URL(extra.value.iframe, window.location.href).href
})

function getBreadcrumbPath (iframePath: string) {
  if (!extra.value?.iframe) return null
  const base = new URL(extra.value.iframe, window.location.href).pathname
  const relative = iframePath.startsWith(base) ? iframePath.slice(base.length) : iframePath
  return `/extra/${route.params.id}?p=${encodeURIComponent(relative)}`
}

function handleMessage (event: MessageEvent) {
  if (!event.data?.breadcrumbs) return
  const crumbs = event.data.breadcrumbs.map((b: any) => ({
    text: b.text,
    to: b.to ? getBreadcrumbPath(b.to) : undefined
  }))
  breadcrumbs.receive({
    breadcrumbs: [
      { text: extra.value?.title || route.params.id as string },
      ...crumbs
    ]
  })
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
  // Set initial breadcrumb
  if (extra.value) {
    breadcrumbs.receive({ breadcrumbs: [{ text: extra.value.title || route.params.id as string }] })
  }
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})
</script>

<i18n lang="yaml">
fr:
  unknownPage: Page inconnue {id}
en:
  unknownPage: Unknown page {id}
</i18n>
