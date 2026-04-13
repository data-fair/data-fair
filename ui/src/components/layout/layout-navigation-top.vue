<template>
  <v-app-bar
    density="compact"
    scroll-behavior="elevate"
    border="b"
    flat
  >
    <!-- Drawer activator on mobile -->
    <v-app-bar-nav-icon
      v-if="user && !lgAndUp"
      @click="drawer = !drawer"
    />

    <!-- Logo and title -->
    <div
      class="d-flex align-center"
      style="min-width: 256px"
    >
      <img
        :src="$uiConfig.brand.logo || defaultLogo"
        alt="Logo"
        class="mx-2"
        style="height: 28px; width: 28px;"
      >
      <span class="text-title-large text-primary font-weight-bold text-no-wrap">
        {{ $uiConfig.brand.title || 'Data Fair' }}
      </span>
    </div>

    <v-breadcrumbs
      v-if="showBreadcrumbs"
      :items="breadcrumbItems"
      density="compact"
    >
      <template #item="{ item }">
        <v-breadcrumbs-item
          :to="item.to"
          :disabled="!item.to"
          :class="item.to ? 'text-primary' : undefined"
          style="opacity: 0.9;"
        >
          {{ item.title }}
        </v-breadcrumbs-item>
      </template>
    </v-breadcrumbs>

    <v-spacer />

    <df-notification-queue
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
import type { createBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import DfNotificationQueue from '@data-fair/lib-vuetify-events/DfNotificationQueue.vue'
import DfPersonalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import DfThemeSwitcher from '@data-fair/lib-vuetify/theme-switcher.vue'
import DfAgentChatToggle from '@data-fair/lib-vuetify-agents/DfAgentChatToggle.vue'
import { useDisplay } from 'vuetify'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
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

const showBreadcrumbs = computed(() => {
  if (!mdAndUp.value) return false
  if (!props.breadcrumbs) return false
  if (props.breadcrumbs.items.value.length === 0) return false
  if (props.breadcrumbs.routeName.value !== (route.name as string)) return false
  return true
})

function truncate (str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

const breadcrumbItems = computed(() => {
  if (!props.breadcrumbs) return []
  return props.breadcrumbs.items.value.map(item => ({
    title: truncate(item.text, 50),
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
