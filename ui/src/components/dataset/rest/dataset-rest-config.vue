<template>
  <v-card>
    <v-list density="compact">
      <v-list-item :prepend-icon="mdiHistory">
        <div class="text-body-small text-medium-emphasis">
          {{ t('historyLabel') }}
        </div>
        <div>{{ rest?.history ? t('history') : t('noHistory') }}</div>
        <template #append>
          <dataset-rest-history-menu
            :history="rest?.history ?? false"
            :color="fieldColor('history')"
            @change="updateRest({ history: $event })"
          />
        </template>
      </v-list-item>

      <v-list-item :prepend-icon="mdiDeleteRestore">
        <div class="text-body-small text-medium-emphasis">
          {{ t('ttlLabel') }}
        </div>
        <div>{{ rest?.ttl?.active ? t('ttl', { col: rest.ttl.prop, days: rest.ttl.delay.value }) : t('noTTL') }}</div>
        <template #append>
          <dataset-rest-ttl-menu
            :ttl="rest?.ttl"
            :schema="dataset?.schema ?? []"
            :color="fieldColor('ttl')"
            @change="updateRest({ ttl: $event })"
          />
        </template>
      </v-list-item>

      <v-list-item
        v-if="rest?.history"
        :prepend-icon="mdiDeleteClock"
      >
        <div class="text-body-small text-medium-emphasis">
          {{ t('historyTtlLabel') }}
        </div>
        <div>{{ rest?.historyTTL?.active ? t('historyTtl', { days: rest.historyTTL.delay.value }) : t('noHistoryTTL') }}</div>
        <template #append>
          <dataset-rest-ttl-menu
            :ttl="rest?.historyTTL"
            :schema="dataset?.schema ?? []"
            :revisions="true"
            :color="fieldColor('historyTTL')"
            @change="updateRest({ historyTTL: $event })"
          />
        </template>
      </v-list-item>

      <v-list-item :prepend-icon="mdiAccountDetails">
        <div class="text-body-small text-medium-emphasis">
          {{ t('storeUpdatedByLabel') }}
        </div>
        <div>{{ rest?.storeUpdatedBy ? t('storeUpdatedBy') : t('noStoreUpdatedBy') }}</div>
        <template #append>
          <dataset-rest-store-updated-by-menu
            :store-updated-by="rest?.storeUpdatedBy ?? false"
            :color="fieldColor('storeUpdatedBy')"
            @change="updateRest({ storeUpdatedBy: $event })"
          />
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  historyLabel: Historisation
  history: Activée (conserve les révisions des lignes)
  noHistory: Désactivée (ne conserve pas les révisions des lignes)
  ttlLabel: Expiration des lignes
  ttl: "Suppression automatique des lignes dont la colonne {col} contient une date dépassée de {days} jours"
  noTTL: Pas de politique d'expiration des lignes configurée
  historyTtlLabel: Expiration de l'historique
  historyTtl: "Suppression automatique des révisions de lignes qui datent de plus de {days} jours"
  noHistoryTTL: Pas de politique d'expiration des révisions configurée
  storeUpdatedByLabel: Suivi des modifications
  storeUpdatedBy: Stockage de l'utilisateur responsable d'une modification de ligne
  noStoreUpdatedBy: Pas de stockage de l'utilisateur responsable d'une modification de ligne
en:
  historyLabel: Revision history
  history: Enabled (stores revisions of lines)
  noHistory: Disabled (does not store revisions of lines)
  ttlLabel: Row expiration
  ttl: "Automatically delete lines whose column {col} contains a date exceeded by {days} days"
  noTTL: No automatic expiration of lines configured
  historyTtlLabel: History expiration
  historyTtl: "Automatically delete revisions more than {days} days old"
  noHistoryTTL: No automatic expiration of revisions configured
  storeUpdatedByLabel: Track modifications
  storeUpdatedBy: Store the user responsible for line modifications
  noStoreUpdatedBy: No storage of the user responsible for line modifications
</i18n>

<script setup lang="ts">
import { mdiAccountDetails, mdiDeleteClock, mdiDeleteRestore, mdiHistory } from '@mdi/js'
import equal from 'fast-deep-equal'

const props = defineProps<{
  rest?: any
  serverRest?: any
  dataset?: any
}>()

const emit = defineEmits<{
  'update:rest': [value: any]
}>()

const { t } = useI18n()

function fieldColor (field: string): string {
  if (!props.serverRest) return 'primary'
  return !equal(props.rest?.[field], props.serverRest[field]) ? 'accent' : 'primary'
}

function updateRest (updates: Record<string, any>) {
  emit('update:rest', { ...props.rest, ...updates })
}
</script>
