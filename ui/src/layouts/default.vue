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
    <!--
      flex-grow-1: prend tout l'espace restant à côté du navigation-right
      min-width: 0: empêche le contenu flex de déborder (par défaut min-width: auto empêche le rétrécissement en dessous du contenu intrinsèque)
    -->
    <div
      class="flex-grow-1"
      style="min-width: 0"
    >
      <slot />
    </div>
    <!--
      Cible du Teleport de navigation-right-local.vue
      position-sticky top-0: reste visible en haut pendant le scroll du contenu
      flex-shrink-0: ne se réduit jamais, garde sa largeur fixe
      align-self-start: aligné en haut du conteneur flex
      overflow-y-auto: scroll interne si le contenu dépasse la hauteur de l'écran
      Largeur et hauteur max identiques à un v-navigation-drawer Vuetify (256px, 100vh)
    -->
    <div
      id="navigation-right-local"
      class="position-sticky top-0 flex-shrink-0 align-self-start overflow-y-auto pt-6"
      style="width: 256px; max-height: 100vh"
    />
  </v-main>

  <!-- Agent chat drawer: order=1 to render after the v-main scrollbar -->
  <df-agent-chat-drawer
    v-if="showAgentChat && session.account.value"
    :account-type="session.account.value.type"
    :account-id="session.account.value.id"
    :system-prompt="agentSystemPrompt"
    :drawer-props="agentChatDrawerProps"
  />
</template>

<script lang="ts" setup>
import { ref, shallowRef, computed, watchEffect, effectScope, onScopeDispose } from 'vue'
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
import { useAgentDataQualityTools } from '~/composables/dataset/agent-data-quality-tools'
import { provideShowAgentChat } from '~/composables/agent/use-show-chat'
import DfAgentChatDrawer from '@data-fair/lib-vuetify-agents/DfAgentChatDrawer.vue'
import { useAgentChatDrawer } from '@data-fair/lib-vuetify-agents/useAgentChatDrawer.js'

const { lgAndUp, xlAndUp, xxl } = useDisplay()
const drawer = ref(lgAndUp.value)
const session = useSession()
const { user } = session
const breadcrumbs = provideBreadcrumbs()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { navigationGroups } = useNavigationItems({ t, locale })

const showAgentChat = provideShowAgentChat(session)

const agentSystemPrompts: Record<string, string> = {
  fr: `Tu es l'assistant IA de Data Fair, une plateforme de gestion et de publication de données privée ou ouvertes. Tu aides les utilisateurs à naviguer dans l'interface, explorer les jeux de données, interroger les données, configurer les applications de visualisation, et gérer les métadonnées.

Consignes :
- Réponds dans la langue de l'utilisateur
- Sois concis et précis
- Utilise fréquemment l'outil getCurrentLocation pour comprendre le positionnement de l'utilisateur dans l'interface
- Lorsque le sous-agent d'exploration de données renvoie des "Navigation params", utilise l'outil navigate avec ces paramètres en query pour montrer à l'utilisateur les données filtrées dans la page tableau du jeu de données (chemin: /dataset/{id}/table)`,
  en: `You are the AI assistant for Data Fair, a platform for managing and publishing private or open data. You help users navigate the interface, explore datasets, query data, configure visualization applications, and manage metadata.

Guidelines:
- Respond in the user's language
- Be concise and precise
- Frequently use the tool getCurrentLocation to understand the positioning of the user in the UI.
- When the data exploration subagent returns "Navigation params", use the navigate tool with those parameters as query to show the user the filtered data in the dataset table page (path: /dataset/{id}/table)`
}

const agentSystemPrompt = computed(() => agentSystemPrompts[locale.value] ?? agentSystemPrompts.en)

let toolsScope: ReturnType<typeof effectScope> | null = null
watchEffect(() => {
  if (showAgentChat.value && !toolsScope) {
    agentChatState.value = useAgentChatDrawer()
    toolsScope = effectScope()
    toolsScope.run(() => {
      useAgentNavigationTools({ route, router, navigationGroups, breadcrumbItems: breadcrumbs.items, locale })
      useAgentDatasetTools(locale)
      useAgentDatasetDataTools(locale)
      useAgentDataQualityTools(locale)
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
  if (xlAndUp.value) {
    temporary = false
    if (xxl.value) width = 450
  }

  return {
    class: 'border-secondary border-md border-e-0 border-opacity-100 rounded-lg rounded-e-0',
    style: 'overflow: hidden',
    disableResizeWatcher: true,
    width,
    temporary
  }
})

const agentChatState = shallowRef<ReturnType<typeof useAgentChatDrawer> | null>(null)

</script>

<style scoped>
:deep(.v-main__scroller) {
  display: flex !important;
}
#navigation-right-local:empty {
  display: none;
}
</style>
