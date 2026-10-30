<template>
  <v-card>
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon
          :icon="mdiHistory"
          color="primary"
        />
        {{ t('title') }}
      </v-card-title>
    </v-card-item>
    <v-card-text class="py-0">
      <df-recent-activity :events-url="`${$sitePath}/events`" />
    </v-card-text>
    <v-card-actions>
      <v-btn
        to="/events"
        variant="text"
        color="primary"
        block
      >
        {{ t('seeAll') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  title: Activité récente
  seeAll: Voir la traçabilité
en:
  title: Recent activity
  seeAll: See the traceability
</i18n>

<script setup lang="ts">
import { mdiHistory } from '@mdi/js'
import { DfRecentActivity } from '@data-fair/lib-vuetify-events'

const { t } = useI18n()
</script>
