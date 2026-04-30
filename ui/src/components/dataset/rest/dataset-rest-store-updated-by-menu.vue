<template>
  <v-menu
    v-model="show"
    :close-on-content-click="false"
    max-width="400"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        icon
        variant="text"
        :color="color"
        v-bind="activatorProps"
      >
        <v-icon :icon="mdiPencil" />
      </v-btn>
    </template>
    <v-card>
      <v-alert
        :text="storeUpdatedBy ? t('alertDeactivate') : t('alertActivate')"
        :type="storeUpdatedBy ? 'warning' : 'info'"
        :icon="false"
        variant="tonal"
        density="compact"
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
          variant="flat"
          @click="change(false)"
        >
          {{ t('deActivate') }}
        </v-btn>
        <v-btn
          v-else
          color="primary"
          variant="flat"
          @click="change(true)"
        >
          {{ t('activate') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  alertActivate: "Si vous activez le stockage des utilisateurs qui font des modifications de ligne tous les utilisateurs ayant accès en lecture à ce jeu de données pourront consulter cette information."
  alertDeactivate: "Si vous désactivez le stockage des utilisateurs qui font des modifications de ligne cette information sera supprimée et ne sera récupérable."
  activate: Activer
  deActivate: Désactiver
  cancel: Annuler
en:
  alertActivate: "If you activate the storage of the users that make line changes all users with read access to this dataset will be able to read this information."
  alertDeactivate: "If you deactivate the storage of the users that make line changes this information will be deleted and cannot be recovered."
  activate: Activate
  deActivate: Deactivate
  cancel: Cancel
</i18n>

<script setup lang="ts">
import { mdiPencil } from '@mdi/js'

withDefaults(defineProps<{
  storeUpdatedBy?: boolean
  color?: string
}>(), {
  storeUpdatedBy: false,
  color: 'primary'
})

const emit = defineEmits<{
  change: [value: boolean]
}>()

const { t } = useI18n()

const show = ref(false)

function change (value: boolean) {
  emit('change', value)
  show.value = false
}
</script>
