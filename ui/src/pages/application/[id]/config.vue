<template>
  <application-config />
</template>

<i18n lang="yaml">
fr:
  applications: Applications
  configuration: Configuration
en:
  applications: Applications
  configuration: Configuration
</i18n>

<script setup lang="ts">
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const breadcrumbs = useBreadcrumbs()

const { application } = useApplicationStore()

watch(application, (app) => {
  if (!app) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('applications'), to: '/applications' },
      { text: app.title || app.id, to: `/application/${app.id}` },
      { text: t('configuration') }
    ]
  })
}, { immediate: true })
</script>
