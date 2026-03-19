<template>
  <v-container>
    <h1 class="text-h4 mb-4">
      {{ t('title') }}
    </h1>
    <v-alert
      type="info"
      variant="tonal"
    >
      {{ t('wip') }}
    </v-alert>
  </v-container>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<i18n lang="yaml">
fr:
  title: Tableau de bord
  wip: Page en cours de migration.
en:
  title: Dashboard
  wip: Page migration in progress.
</i18n>
