<template>
  <df-layout-fetch-error
    v-if="store.applicationFetch.error.value"
    :error="store.applicationFetch.error.value"
    :back-label="t('backToApplications')"
    back-to="/applications"
  />
  <router-view v-else />
</template>

<script setup lang="ts">
import { provideApplicationStore } from '~/composables/application/application-store'

definePage({ alias: '/applications/:id' })

const { t } = useI18n()
const route = useRoute<'/application/[id]'>()
const store = provideApplicationStore(route.params.id)
</script>

<i18n lang="yaml">
fr:
  backToApplications: Retour aux applications
en:
  backToApplications: Back to applications
</i18n>
