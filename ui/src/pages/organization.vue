<template>
  <template v-if="authorized">
    <d-frame
      id="organization"
      :src="`${$sdUrl}/organization/${account.id}?embed=true`"
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
      {{ t('notAuthorized') }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { t } = useI18n()
const { user, account } = useSessionAuthenticated()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const authorized = computed(() => {
  if (!user.value) return false
  if (account.value.type !== 'organization') return false
  const org = user.value.organizations.find(o => o.id === account.value.id)
  if (!org) return false
  if (org.role !== $uiConfig.adminRole) return false
  if (org.department) return false
  return true
})
</script>

<i18n lang="yaml">
fr:
  notAuthorized: Vous n'êtes pas autorisé à accéder à cette page.
en:
  notAuthorized: You are not authorized to access this page.
</i18n>
