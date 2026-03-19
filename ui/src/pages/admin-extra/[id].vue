<template>
  <template v-if="extra">
    <iframe
      v-if="iframeUrl"
      :src="iframeUrl"
      width="100%"
      :style="{ height: iframeHeight }"
      frameborder="0"
      @load="onLoad"
    />
  </template>
  <v-container v-else>
    <v-alert type="error">
      {{ t('unknownPage', { id: route.params.id }) }}
    </v-alert>
  </v-container>
</template>

<script lang="ts" setup>
const { t } = useI18n()
const route = useRoute<'/admin-extra/[id]'>()

const extra = computed(() => {
  return $uiConfig.extraAdminNavigationItems.find(e => e.id === route.params.id)
})

const iframeUrl = computed(() => {
  if (!extra.value?.iframe) return null
  return new URL(extra.value.iframe, window.location.href).href
})

const iframeHeight = ref('600px')

function onLoad (e: Event) {
  const iframe = e.target as HTMLIFrameElement
  try {
    const height = iframe.contentWindow?.document.body.scrollHeight
    if (height) iframeHeight.value = height + 'px'
  } catch {}
}
</script>

<i18n lang="yaml">
fr:
  unknownPage: Page inconnue {id}
en:
  unknownPage: Unknown page {id}
</i18n>
