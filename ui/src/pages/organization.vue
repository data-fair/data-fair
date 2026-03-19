<template>
  <template v-if="authorized">
    <iframe
      :src="`${$sdUrl}/organization/${account.id}?embed=true`"
      width="100%"
      :style="{ height: iframeHeight }"
      frameborder="0"
      @load="onLoad"
    />
  </template>
  <v-container v-else>
    <v-alert type="error">
      {{ t('notAuthorized') }}
    </v-alert>
  </v-container>
</template>

<script lang="ts" setup>
const { t } = useI18n()
const { user, account } = useSessionAuthenticated()

const authorized = computed(() => {
  if (!user.value) return false
  if (account.value.type !== 'organization') return false
  const org = user.value.organizations.find(o => o.id === account.value.id)
  if (!org) return false
  if (org.role !== $uiConfig.adminRole) return false
  if (org.department) return false
  return true
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
  notAuthorized: Vous n'êtes pas autorisé à accéder à cette page.
en:
  notAuthorized: You are not authorized to access this page.
</i18n>
