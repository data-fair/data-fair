<template>
  <layout-navigation-top
    v-model:drawer="drawer"
    :breadcrumbs="breadcrumbs"
    :show-agent-chat="showAgentChat"
  />
  <layout-navigation-left
    v-if="user"
    v-model="drawer"
  />
  <v-main>
    <slot />
  </v-main>
  <df-agent-chat-drawer
    v-if="showAgentChat && session.account.value"
    :account-type="session.account.value.type"
    :account-id="session.account.value.id"
    :drawer-props="agentChatDrawerProps"
  />
</template>

<script lang="ts" setup>
import { ref, computed, watchEffect, effectScope, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import LayoutNavigationTop from '~/components/layout/layout-navigation-top.vue'
import LayoutNavigationLeft from '~/components/layout/layout-navigation-left.vue'
import { provideBreadcrumbs } from '~/composables/use-breadcrumbs'
import { useNavigationItems } from '~/composables/use-navigation-items'
import { useAgentNavigationTools } from '~/composables/use-agent-navigation-tools'
import { $uiConfig, $apiPath } from '~/context'
import DfAgentChatDrawer from '@data-fair/lib-vuetify-agents/DfAgentChatDrawer.vue'

const { lgAndUp } = useDisplay()
const drawer = ref(lgAndUp.value)
const session = useSession()
const { user } = session
const breadcrumbs = provideBreadcrumbs()
const route = useRoute()
const router = useRouter()
const { navigationGroups } = useNavigationItems()

const agentChatFetch = ($uiConfig.agentsIntegration && session.account.value)
  ? useFetch<{ agentChat: boolean }>(`${$apiPath}/settings/${session.account.value.type}/${session.account.value.id}/agent-chat`)
  : null
const showAgentChat = computed(() => !!agentChatFetch?.data.value?.agentChat)

let toolsScope: ReturnType<typeof effectScope> | null = null
watchEffect(() => {
  if (showAgentChat.value && !toolsScope) {
    toolsScope = effectScope()
    toolsScope.run(() => {
      useAgentNavigationTools({ route, router, navigationGroups, breadcrumbItems: breadcrumbs.items })
    })
  } else if (!showAgentChat.value && toolsScope) {
    toolsScope.stop()
    toolsScope = null
  }
})
onScopeDispose(() => { toolsScope?.stop() })

const agentChatDrawerProps = computed(() => {
  return {
    class: 'border-secondary border-t-sm border-s-sm border-opacity-100 rounded-ts-xl elevation-4',
    style: 'overflow: hidden'
  }
})
</script>
