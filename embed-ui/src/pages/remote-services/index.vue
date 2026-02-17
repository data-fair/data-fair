<template>
  <v-container>
    <p
      class="px-0 mb-4"
      style="height: auto;"
    >
      {{ t('description') }}
    </p>

    <v-row
      v-if="remoteServicesFetch.data.value"
      class="resourcesList"
    >
      <v-col
        v-for="remoteService in remoteServicesFetch.data.value.results"
        :key="remoteService.id"
        cols="12"
        md="6"
        lg="4"
      >
        <remote-service-card :remote-service="remoteService" />
      </v-col>
      <search-progress :loading="remoteServicesFetch.loading.value" />
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  remoteServices: Services interopérables
  description: Cet espace vous permet de gérer les services Web configurés pour l'interopérabilité. Ces services sont généralement utilisés pour proposer des capacités d'enrichissement aux utilisateurs. Un service interopérable peut également être un jeu de données data-fair (local ou distant).
  configureService: Configurer un service
en:
  remoteServices: Interoperable services
  description: This page lets you manage the Web services configured for interoperability. These services are mostly used to propose extentions to the users. An interoperable service can also be a data-fair dataset (local or remote).
  configureService: Configure a service
</i18n>

<script lang="ts" setup>
import { RemoteService } from '#api/types'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()

const params = computed(() => ({
  size: 10000,
  select: 'title,description,public,privateAccess',
  showAll: 'true',
  html: 'true'
}))
const remoteServicesFetch = useFetch<{ count: number, results: RemoteService[] }>(`${$apiPath}/remote-services`, { query: params })

setBreadcrumbs([
  { text: t('remoteServices') }
])
</script>
