<template>
  <v-menu
    v-model="show"
    :close-on-content-click="false"
    max-width="400"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        icon
        color="warning"
        v-bind="activatorProps"
      >
        <v-icon :icon="mdiPencil" />
      </v-btn>
    </template>
    <v-card>
      <v-alert
        :text="storeUpdatedBy ? t('alertDeactivate') : t('alertActivate')"
        :type="storeUpdatedBy ? 'warning' : 'info'"
        variant="tonal"
        density="compact"
        :icon="false"
        class="mb-0 mt-1"
      />
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="show = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          v-if="storeUpdatedBy"
          color="warning"
          @click="change(false)"
        >
          {{ t('deActivate') }}
        </v-btn>
        <v-btn
          v-else
          color="primary"
          @click="change(true)"
        >
          {{ t('activate') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
import { mdiPencil } from '@mdi/js'

const messages = {
  fr: {
    alertActivate: 'Si vous activez le stockage des utilisateurs qui font des modifications de ligne tous les utilisateurs ayant accès en lecture à ce jeu de données pourront consulter cette information.',
    alertDeactivate: 'Si vous désactivez le stockage des utilisateurs qui font des modifications de ligne cette information sera supprimée et ne sera récupérable.',
    activate: 'activer',
    deActivate: 'désactiver',
    cancel: 'annuler'
  },
  en: {
    alertActivate: 'If you activate the storage of the users that make line changes all users with read access to this dataset will be able to read this information.',
    alertDeactivate: 'If you deactivate the storage of the users that make line changes this information will be deleted and will not be recoverable.',
    activate: 'activate',
    deActivate: 'deactivate',
    cancel: 'cancel'
  }
}

defineProps<{
  storeUpdatedBy: boolean
}>()

const emit = defineEmits<{
  change: [value: boolean]
}>()

const { t } = useI18n({ messages })

const show = ref(false)

function change (value: boolean) {
  emit('change', value)
  show.value = false
}
</script>
