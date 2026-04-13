<template>
  <template v-if="extra">
    <d-frame
      v-if="iframeUrl"
      :id="`admin-extra-${route.params.id}`"
      :src="iframeUrl"
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
  <v-container v-else>
    <v-alert type="error">
      {{ t('unknownPage', { id: route.params.id }) }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { t } = useI18n()
const route = useRoute<'/admin-extra/[id]'>()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

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
