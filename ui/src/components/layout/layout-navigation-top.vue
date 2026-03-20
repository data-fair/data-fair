<template>
  <v-app-bar
    color="primary"
    density="compact"
  >
    <v-app-bar-nav-icon
      @click="drawer = !drawer"
    />
    <v-app-bar-title class="text-body-1">
      Data Fair
    </v-app-bar-title>
    <v-breadcrumbs
      v-if="showBreadcrumbs"
      :items="breadcrumbItems"
      density="compact"
      class="pa-0"
    />
    <v-spacer />
    <layout-notifications-queue
      v-if="$uiConfig.eventsIntegration && user"
      :events-url="$sitePath + '/events'"
    />
    <df-personal-menu />
  </v-app-bar>
</template>

<script lang="ts" setup>
import DfPersonalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import { useDisplay } from 'vuetify'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import type { createBreadcrumbs } from '~/composables/use-breadcrumbs'

const props = defineProps<{
  breadcrumbs?: ReturnType<typeof createBreadcrumbs>
}>()

const drawer = defineModel<boolean>('drawer', { required: true })
const { user } = useSession()
const { mdAndUp } = useDisplay()
const route = useRoute()

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
