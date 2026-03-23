<template>
  <v-app-bar
    color="background"
    density="compact"
    scroll-behavior="elevate"
    flat
  >
    <v-app-bar-nav-icon
      v-if="user && !lgAndUp"
      @click="drawer = !drawer"
    />
    <div
      class="d-flex align-center"
      style="min-width: 256px"
    >
      <img
        :src="logoUrl"
        alt="Logo"
        class="ml-3 mr-2"
        style="height: 28px; width: 28px;"
      >
      <span class="text-title-large text-primary font-weight-bold text-no-wrap ml-2 mr-6">
        {{ $uiConfig.brand.title || 'Data Fair' }}
      </span>
    </div>
    <v-breadcrumbs
      v-if="showBreadcrumbs"
      :items="breadcrumbItems"
      density="compact"
    />
    <v-spacer />
    <layout-notifications-queue
      v-if="$uiConfig.eventsIntegration && user"
      :events-url="$sitePath + '/events'"
    />
    <df-theme-switcher />
    <df-personal-menu />
    <df-agent-chat-toggle
      v-if="showAgentChat"
      size="small"
    />
  </v-app-bar>
</template>

<script lang="ts" setup>
import DfPersonalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import DfThemeSwitcher from '@data-fair/lib-vuetify/theme-switcher.vue'
import DfAgentChatToggle from '@data-fair/lib-vuetify-agents/DfAgentChatToggle.vue'
import { useDisplay } from 'vuetify'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import type { createBreadcrumbs } from '~/composables/use-breadcrumbs'
import { $uiConfig } from '~/context'
import defaultLogo from '~/assets/logo.svg'

const props = defineProps<{
  breadcrumbs?: ReturnType<typeof createBreadcrumbs>
  showAgentChat?: boolean
}>()

const drawer = defineModel<boolean>('drawer', { required: true })
const { user } = useSession()
const { mdAndUp, lgAndUp } = useDisplay()
const route = useRoute()

const logoUrl = $uiConfig.brand.logo || defaultLogo

const showBreadcrumbs = computed(() => {
  if (!mdAndUp.value) return false
  if (!props.breadcrumbs) return false
  if (props.breadcrumbs.items.value.length === 0) return false
  if (props.breadcrumbs.routeName.value !== (route.name as string)) return false
  return true
})

const breadcrumbItems = computed(() => {
  if (!props.breadcrumbs) return []
  return props.breadcrumbs.items.value.map(item => ({
    title: item.text,
    to: item.to
  }))
})
</script>

<i18n lang="yaml">
fr:
  title: Data Fair
en:
  title: Data Fair
</i18n>
