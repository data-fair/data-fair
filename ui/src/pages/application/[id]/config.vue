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
import { provideApplicationStore } from '~/composables/application/application-store'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/application/[id]/config'>()
const breadcrumbs = useBreadcrumbs()

const { application } = provideApplicationStore(route.params.id)

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
