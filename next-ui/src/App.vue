<template>
  <v-app>
    <v-main>
      <v-container fluid>
        <RouterView />
      </v-container>
      <ui-notif />
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
import uiNotif from '@data-fair/lib-vuetify/ui-notif.vue'

const session = useSession()

useHead({
  htmlAttrs: () => ({ lang: session.lang.value ?? 'fr' })
})
</script>

<style>
</style>
