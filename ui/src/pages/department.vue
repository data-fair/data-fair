<template>
  <d-frame
    v-if="authorized"
    id="department"
    :src="`${$sdUrl}/organization/${account.id}/department/${account.department}?embed=true`"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    :adapter.prop="stateChangeAdapter"
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
  />
  <v-container v-else>
    <v-alert type="error">
      {{ t('notAuthorized') }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const { user, account } = useSessionAuthenticated()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('department') }] })

const authorized = computed(() => {
  if (!user.value) return false
  if (account.value.type !== 'organization') return false
  const org = user.value.organizations.find(o => o.id === account.value.id)
  if (!org) return false
  if (org.role !== $uiConfig.adminRole) return false
  if (!org.department) return false
  return true
})
</script>

<i18n lang="yaml">
fr:
  department: Gestion du département
  notAuthorized: Vous n'êtes pas autorisé à accéder à cette page.
en:
  department: Manage department
  notAuthorized: You are not authorized to access this page.
</i18n>
