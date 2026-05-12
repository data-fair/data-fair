<template>
  <div>
    <v-alert
      v-if="summary.cancelled"
      type="error"
      :value="true"
      variant="outlined"
    >
      {{ t('cancelled') }}
    </v-alert>
    <template v-else>
      <p
        v-if="summary.nbOk"
        class="mb-2"
      >
        {{ t('resultOk', {nb: summary.nbOk.toLocaleString()}) }}
      </p>
      <p
        v-if="summary.nbCreated"
        class="mb-2"
      >
        {{ t('resultCreated', {nb: summary.nbCreated.toLocaleString()}) }}
      </p>
      <p
        v-if="summary.nbModified"
        class="mb-2"
      >
        {{ t('resultModified', {nb: summary.nbModified.toLocaleString()}) }}
      </p>
      <p
        v-if="summary.nbNotModified"
        class="mb-2"
      >
        {{ t('resultNotModified', {nb: summary.nbNotModified.toLocaleString()}) }}
      </p>
      <p
        v-if="summary.nbDeleted"
        class="mb-2"
      >
        {{ t('resultDeleted', {nb: summary.nbDeleted.toLocaleString()}) }}
      </p>
      <v-alert
        v-if="summary.dropped"
        type="warning"
        :value="true"
        variant="outlined"
      >
        {{ t('dropped') }}
      </v-alert>
      <v-alert
        v-if="!summary.indexedAt"
        type="warning"
        :value="true"
        variant="outlined"
      >
        {{ t('waitForIndex') }}
      </v-alert>
    </template>
    <v-alert
      v-if="summary.nbErrors"
      type="error"
      :value="true"
      variant="outlined"
    >
      {{ t('resultErrors', {nb: summary.nbErrors.toLocaleString()}) }}
      <ul>
        <li
          v-for="(error, i) in summary.errors"
          :key="i"
        >
          <span v-if="error.line !== -1">{{ t('line') }} {{ error.line }} : </span>{{ error.error }}
        </li>
      </ul>
    </v-alert>
    <v-alert
      v-if="summary.nbWarnings"
      type="error"
      :value="true"
      variant="outlined"
    >
      {{ t('resultWarnings', {nb: summary.nbWarnings.toLocaleString()}) }}
      <ul>
        <li
          v-for="(warning, i) in summary.warnings"
          :key="i"
        >
          <span v-if="warning.line !== -1">{{ t('line') }} {{ warning.line }} : </span>{{ warning.warning }}
        </li>
      </ul>
    </v-alert>
  </div>
</template>

<i18n lang="yaml">
fr:
  resultOk: "{nb} ligne(s) OK"
  resultModified: "{nb} ligne(s) modifiée(s)"
  resultNotModified: "{nb} ligne(s) sans modification"
  resultErrors: "{nb} erreur(s)"
  resultWarnings: "{nb} avertissement(s)"
  resultCreated: "{nb} ligne(s) créée(s)"
  resultDeleted: "{nb} ligne(s) supprimées(s)"
  line: ligne
  dropped: "Toutes les lignes existantes ont été supprimées"
  cancelled: "Suppression des lignes existantes et autres opérations annulées à cause des erreurs"
  waitForIndex: Les opérations demandées étant volumineuses, elles seront traitées de manière légèrement différée. Veuillez patienter, la table sera rafraîchie quand les données seront traitées.
en:
  resultOk: "{nb} OK line(s)"
  resultModified: "{nb} modified line(s)"
  resultNotModified: "{nb} line(s) without modifications"
  resultErrors: "{nb} error(s)"
  resultWarnings: "{nb} warning(s)"
  resultCreated: "{nb} created line(s)"
  resultDeleted: "{nb} deleted line(s)"
  line: line
  dropped: "All existing lines have been deleted"
  cancelled: "Deletion of existing lines and other operations cancelled because of errors"
  waitForIndex: The requested operations are large, they will be processed with a slight delay. Please wait, the table will be refreshed when the data is processed.
</i18n>

<script setup lang="ts">
import { type RestActionsSummary } from '#api/types'

defineProps<{ summary: RestActionsSummary }>()

const { t } = useI18n()
</script>
