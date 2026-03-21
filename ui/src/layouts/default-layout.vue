<template>
  <layout-navigation-top
    v-model:drawer="drawer"
    :breadcrumbs="breadcrumbs"
  />
  <layout-navigation-left
    v-if="user"
    v-model="drawer"
  />
  <v-main>
    <slot />
  </v-main>
  <df-agent-chat
    v-if="showAgentChat && session.account.value"
    :account-type="session.account.value.type"
    :account-id="session.account.value.id"
    :title="session.account.value.name"
  />
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useDisplay } from 'vuetify'
import LayoutNavigationTop from '~/components/layout/layout-navigation-top.vue'
import LayoutNavigationLeft from '~/components/layout/layout-navigation-left.vue'
import { provideBreadcrumbs } from '~/composables/use-breadcrumbs'
import { $uiConfig, $apiPath } from '~/context'
import DfAgentChat from '@data-fair/lib-vuetify-agents/DfAgentChat.vue'

const { lgAndUp } = useDisplay()
const drawer = ref(lgAndUp.value)
const session = useSession()
const { user } = session
const breadcrumbs = provideBreadcrumbs()

const agentChatFetch = ($uiConfig.agentsIntegration && session.account.value)
  ? useFetch<{ agentChat: boolean }>(`${$apiPath}/settings/${session.account.value.type}/${session.account.value.id}/agent-chat`)
  : null
const showAgentChat = computed(() => !!agentChatFetch?.data.value?.agentChat)
</script>
