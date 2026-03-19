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
        <v-icon icon="mdi-pencil" />
      </v-btn>
    </template>
    <v-card>
      <v-alert
        :text="history ? t('alertDeactivate') : t('alertActivate')"
        :type="history ? 'warning' : 'info'"
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
          v-if="history"
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
const messages = {
  fr: {
    alertActivate: 'Si vous activez l\'historisation le volume de données consommé sera augmenté de manière importante. En fonction du nombre de lignes du jeu de données cette opération peut prendre du temps.',
    alertDeactivate: 'Si vous désactivez l\'historisation toutes les révisions de lignes déjà stockées seront supprimées et ne seront pas récupérables.',
    activate: 'activer l\'historisation',
    deActivate: 'désactiver l\'historisation',
    cancel: 'annuler'
  },
  en: {
    alertActivate: 'If you activate the history the used data storage will be significantly increased. Depending on the number of lines this operation can take some time.',
    alertDeactivate: 'If you deactivate the history all lines revisions already stored will be deleted and will not be recoverable.',
    activate: 'activate history',
    deActivate: 'deactivate history',
    cancel: 'cancel'
  }
}

defineProps<{
  history: boolean
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
