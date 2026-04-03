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
const { t } = useI18n()
const route = useRoute<'/admin-extra/[id]'>()

const extra = computed(() => {
  return $uiConfig.extraAdminNavigationItems.find((e: any) => e.id === route.params.id)
})

const iframeUrl = computed(() => {
  if (!extra.value?.iframe) return null
  return new URL(extra.value.iframe, window.location.href).href
})
</script>

<i18n lang="yaml">
fr:
  unknownPage: Page inconnue {id}
en:
  unknownPage: Unknown page {id}
</i18n>
