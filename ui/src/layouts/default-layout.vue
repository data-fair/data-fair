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
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import LayoutNavigationTop from '~/components/layout/layout-navigation-top.vue'
import LayoutNavigationLeft from '~/components/layout/layout-navigation-left.vue'
import { provideBreadcrumbs } from '~/composables/use-breadcrumbs'
import { useNavigationItems } from '~/composables/use-navigation-items'
import { useAgentNavigationTools } from '~/composables/use-agent-navigation-tools'
import { useAgentDatasetTools } from '~/composables/use-agent-dataset-tools'
import { useAgentDatasetDataTools } from '~/composables/use-agent-dataset-data-tools'
import { useAgentGeoTools } from '~/composables/use-agent-geo-tools'
import { useAgentApplicationTools } from '~/composables/use-agent-application-tools'
import { useAgentConnectorTools } from '~/composables/use-agent-connector-tools'
import { provideShowAgentChat } from '~/composables/use-show-agent-chat'
import DfAgentChatDrawer from '@data-fair/lib-vuetify-agents/DfAgentChatDrawer.vue'

const { lgAndUp } = useDisplay()
const drawer = ref(lgAndUp.value)
const session = useSession()
const { user } = session
const breadcrumbs = provideBreadcrumbs()
const route = useRoute()
const router = useRouter()
const { navigationGroups } = useNavigationItems()
const { locale } = useI18n()

const showAgentChat = provideShowAgentChat(session)

let toolsScope: ReturnType<typeof effectScope> | null = null
watchEffect(() => {
  if (showAgentChat.value && !toolsScope) {
    toolsScope = effectScope()
    toolsScope.run(() => {
      useAgentNavigationTools({ route, router, navigationGroups, breadcrumbItems: breadcrumbs.items, locale })
      useAgentDatasetTools(locale)
      useAgentDatasetDataTools(locale)
      useAgentGeoTools(locale)
      useAgentApplicationTools(locale)
      useAgentConnectorTools(locale)
    })
  } else if (!showAgentChat.value && toolsScope) {
    toolsScope.stop()
    toolsScope = null
  }
})
onScopeDispose(() => { toolsScope?.stop() })

const agentChatDrawerProps = computed(() => {
  return {
    class: 'border-secondary border-t-md border-s-md border-opacity-100 elevation-2 rounded-ts-md',
    style: 'overflow: hidden'
  }
})
</script>
