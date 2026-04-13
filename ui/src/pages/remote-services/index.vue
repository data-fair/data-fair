<template>
  <v-container>
    <p class="mb-4">
      {{ t('description') }}
    </p>

    <v-row
      v-if="remoteServicesFetch.data.value"
      class="d-flex align-stretch"
    >
      <v-col
        v-for="remoteService in remoteServicesFetch.data.value.results"
        :key="remoteService.id"
        cols="12"
        sm="6"
        md="4"
      >
        <remote-service-card :remote-service="remoteService" />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  remoteServices: Services interopérables
  description: Cet espace vous permet de gérer les services Web configurés pour l'interopérabilité. Ces services sont généralement utilisés pour proposer des capacités d'enrichissement aux utilisateurs. Un service interopérable peut également être un jeu de données data-fair (local ou distant).
  configureService: Créer un nouveau service
en:
  remoteServices: Interoperable services
  description: This page lets you manage the Web services configured for interoperability. These services are mostly used to propose extentions to the users. An interoperable service can also be a data-fair dataset (local or remote).
  configureService: Create a new service
</i18n>

<script setup lang="ts">
import { RemoteService } from '#api/types'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('remoteServices') }] })

const params = computed(() => ({
  size: 10000,
  select: 'title,description,public,privateAccess',
  showAll: 'true',
  html: 'true'
}))
const remoteServicesFetch = useFetch<{ count: number, results: RemoteService[] }>(`${$apiPath}/remote-services`, { query: params })
</script>
