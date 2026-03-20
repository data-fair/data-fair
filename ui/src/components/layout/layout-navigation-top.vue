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

const drawer = defineModel<boolean>('drawer', { required: true })
const { user } = useSession()
</script>

<i18n lang="yaml">
fr:
  title: Data Fair
en:
  title: Data Fair
</i18n>
