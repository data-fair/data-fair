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
      <layout-auth-required v-if="!user" />
      <slot v-else />
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
    agents
    :drawer-props="agentChatDrawerProps"
  />
</template>

<script lang="ts" setup>
import { ref, shallowRef, computed, watch, watchEffect, effectScope, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import LayoutNavigationTop from '~/components/layout/layout-navigation-top.vue'
import LayoutNavigationLeft from '~/components/layout/layout-navigation-left.vue'
import LayoutAuthRequired from '~/components/layout/layout-auth-required.vue'
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
import { useAgentState } from '@data-fair/lib-vue-agents'
import { buildLocationState } from '~/composables/agent/host-state'
import { toAbsoluteUrl } from '~/composables/agent/url-utils'
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

let toolsScope: ReturnType<typeof effectScope> | null = null
watchEffect(() => {
  if (showAgentChat.value && !toolsScope) {
    agentChatState.value = useAgentChatDrawer()
    toolsScope = effectScope()
    toolsScope.run(() => {
      // Where the user is, published as keyed state rather than answered on
      // demand: a route change re-emits it by itself, so the assistant is told
      // instead of having to spend a whole model request asking. This is what
      // replaced the get_current_location tool.
      useAgentState('location', () => buildLocationState({
        url: toAbsoluteUrl(window.location.origin, router.options.history.base, route.fullPath),
        path: route.path,
        name: route.name as string | undefined,
        params: { ...route.params },
        query: { ...route.query },
        breadcrumbs: breadcrumbs.items.value
      }))
      useAgentNavigationTools({ router, navigationGroups, locale })
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

// Scroll to top on route change
watch(() => route.path, () => {
  document.querySelector('.v-main__scroller')?.scrollTo({ top: 0 })
  document.getElementById('navigation-right-local')?.scrollTo({ top: 0 })
})

</script>

<style scoped>
:deep(.v-main__scroller) {
  display: flex !important;
}
#navigation-right-local:empty {
  display: none;
}
</style>
