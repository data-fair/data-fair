<template>
  <template v-if="application">
    <v-card>
      <v-list density="compact">
        <v-list-item
          v-if="application.owner"
          :prepend-icon="mdiAccount"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('owner') }}
          </div>
          <div>{{ application.owner.name }}</div>
        </v-list-item>

        <v-list-item
          v-if="baseAppFetch.data.value"
          :prepend-icon="mdiSquareEditOutline"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('baseApp') }}
          </div>
          <div>
            {{ baseAppFetch.data.value.title || application.url }}
            <span v-if="baseAppFetch.data.value.version">
              — {{ t('version') }} {{ baseAppFetch.data.value.version }}
            </span>
          </div>
        </v-list-item>

        <v-list-item
          v-if="application.updatedAt"
          :prepend-icon="mdiPencil"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('metadataUpdated') }}
          </div>
          <div>{{ application.updatedBy?.name }} {{ formatDate(application.updatedAt) }}</div>
        </v-list-item>

        <v-list-item :prepend-icon="mdiPlusCircleOutline">
          <div class="text-body-small text-medium-emphasis">
            {{ t('created') }}
          </div>
          <div>{{ application.createdBy?.name }} {{ formatDate(application.createdAt) }}</div>
        </v-list-item>
      </v-list>
    </v-card>
  </template>
</template>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  baseApp: Application de base
  version: version
  metadataUpdated: Métadonnées mises à jour
  created: Création
en:
  owner: Owner
  baseApp: Application model
  version: version
  metadataUpdated: Metadata updated
  created: Created
</i18n>

<script setup lang="ts">
import { mdiAccount, mdiPencil, mdiPlusCircleOutline, mdiSquareEditOutline } from '@mdi/js'
import useApplicationStore from '~/composables/application/application-store'

const { application, baseAppFetch } = useApplicationStore()

const { t, locale } = useI18n()

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}
</script>
