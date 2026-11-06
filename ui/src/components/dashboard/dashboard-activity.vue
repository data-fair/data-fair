<template>
  <v-card>
    <v-card-item>
      <v-card-title
        tag="h2"
        class="d-flex align-center ga-2"
      >
        <v-icon
          :icon="mdiHistory"
          color="primary"
        />
        {{ t('title') }}
      </v-card-title>
    </v-card-item>
    <v-card-text class="py-0">
      <d-frame
        :src="`${$sitePath}/events/embed/events-compact`"
        :iframe-title="t('title')"
        resize="yes"
        @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
      />
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
import { frameNotifArg } from '~/utils/frame-notif'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
</script>
