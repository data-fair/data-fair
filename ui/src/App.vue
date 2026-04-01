<template>
  <v-app>
    <component :is="layout">
      <template #default>
        <RouterView />
      </template>
    </component>
    <ui-notif />
  </v-app>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import uiNotif from '@data-fair/lib-vuetify/ui-notif.vue'
import DefaultLayout from './layouts/default-layout.vue'
import EmbedLayout from './layouts/embed-layout.vue'

// useSession and useHead are auto-imported via vite.config.ts AutoImport plugin
const session = useSession()
const route = useRoute()

const layout = computed(() => {
  if (route.path.startsWith('/embed/') || route.meta.layout === 'embed') {
    return EmbedLayout
  }
  return DefaultLayout
})

useHead({
  htmlAttrs: () => ({ lang: session.lang.value ?? 'fr' })
})
</script>

<style>
html { overflow: hidden; }
</style>
