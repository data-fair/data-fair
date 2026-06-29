<template>
  <d-frame
    v-if="account"
    id="agents-activity"
    :adapter.prop="stateChangeAdapter"
    :src="`/agents/${account.type}/${account.id}/`"
    sync-path="/data-fair/agents-activity/"
    class="fill-height"
    resize="no"
    sync-params
    emit-iframe-messages
    @message="onMessage"
    @iframe-message="onMessage"
    @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
  />
</template>

<script setup lang="ts">
import { useDFramePage } from '~/composables/layout/use-d-frame-page'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()
const session = useSession()
const account = computed(() => session.account.value)

const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('agentsActivity') }] })
</script>

<i18n lang="yaml">
fr:
  agentsActivity: Suivi des agents
en:
  agentsActivity: Agents activity
</i18n>
