<template>
  <v-container
    class="text-center"
    max-width="800"
  >
    <h1 class="text-display-large text-primary mt-8">
      {{ $uiConfig.brand.title || 'Data Fair' }}
    </h1>
    <df-themed-svg
      :source="dataProcessSvg"
      class="mx-auto"
      style="max-width: 400px; width: 100%;"
    />
    <p
      v-if="!$uiConfig.disableApplications"
      class="text-title-medium"
    >
      {{ t('description') }}
    </p>
    <p class="text-title-large font-weight-bold mt-4">
      {{ t('authRequired') }}
    </p>
    <v-btn
      class="mt-4"
      color="primary"
      variant="flat"
      size="large"
      @click="session.login()"
    >
      {{ t('login') }}
    </v-btn>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire
  description: Enrichissez et publiez facilement vos données. Vous pouvez les utiliser dans des applications dédiées et les mettre à disposition d'autres personnes en mode ouvert ou privé.
en:
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
  description: Easily enrich and publish your data. You can use it in dedicated applications and make it available to other people both openly or privately.
</i18n>

<script setup lang="ts">
import dataProcessSvg from '~/assets/svg/Data Process_Two Color.svg?raw'
import { $uiConfig } from '~/context'

const { t } = useI18n()
const session = useSession()
</script>
