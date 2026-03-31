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
  <v-main scrollable>
    <v-layout style="min-height: 100%; position: static">
      <v-main tag="div">
        <slot />
      </v-main>
    </v-layout>
  </v-main>
  <df-agent-chat-drawer
    v-if="showAgentChat && session.account.value"
    :account-type="session.account.value.type"
    :account-id="session.account.value.id"
    :system-prompt="agentSystemPrompt"
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
import { provideBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { useNavigationItems } from '~/composables/layout/use-navigation-items'
import { useAgentNavigationTools } from '~/composables/agent/navigation-tools'
import { useAgentDatasetTools } from '~/composables/dataset/agent-tools'
import { useAgentDatasetDataTools } from '~/composables/dataset/agent-data-tools'
import { useAgentGeoTools } from '~/composables/agent/geo-tools'
import { useAgentApplicationTools } from '~/composables/application/agent-tools'
import { useAgentConnectorTools } from '~/composables/agent/connector-tools'
import { provideShowAgentChat } from '~/composables/agent/use-show-chat'
import DfAgentChatDrawer from '@data-fair/lib-vuetify-agents/DfAgentChatDrawer.vue'

const { lgAndUp, xlAndUp, xxl } = useDisplay()
const drawer = ref(lgAndUp.value)
const session = useSession()
const { user } = session
const breadcrumbs = provideBreadcrumbs()
const route = useRoute()
const router = useRouter()
const { navigationGroups } = useNavigationItems()
const { locale } = useI18n()

const showAgentChat = provideShowAgentChat(session)

const agentSystemPrompts: Record<string, string> = {
  fr: `Tu es l'assistant IA de Data Fair, une plateforme de gestion et de publication de données privée ou ouvertes. Tu aides les utilisateurs à naviguer dans l'interface, explorer les jeux de données, interroger les données, configurer les applications de visualisation, et gérer les métadonnées.

Consignes :
- Réponds dans la langue de l'utilisateur
- Sois concis et précis
- Utilise fréquemment l'outil getCurrentLocation pour comprendre le positionnement de l'utilisateur dans l'interface`,
  en: `You are the AI assistant for Data Fair, a platform for managing and publishing private or open data. You help users navigate the interface, explore datasets, query data, configure visualization applications, and manage metadata.

Guidelines:
- Respond in the user's language
- Be concise and precise
- Frequently use the tool getCurrentLocation to understand the positioning of the user in the UI.`
}

const agentSystemPrompt = computed(() => agentSystemPrompts[locale.value] ?? agentSystemPrompts.en)

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
  let width = 350
  let temporary = true
  if (lgAndUp.value) {
    if (xlAndUp.value) {
      temporary = false
      if (xxl.value) {
        width = 450
      }
    }
  }

  return {
    class: 'border-secondary border-t-md border-s-md border-opacity-100',
    style: 'overflow: hidden',
    width,
    temporary
  }
})
</script>
