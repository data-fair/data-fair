<template>
  <v-container style="max-width: 700px;">
    <v-row
      justify="center"
      class="mt-12"
    >
      <v-col
        cols="12"
        class="text-center"
      >
        <v-icon
          icon="mdi-share-variant"
          size="80"
          color="primary"
          class="mb-6"
        />
        <h1 class="text-h5 mb-4">
          {{ t('title') }}
        </h1>
        <p class="text-body-1 text-medium-emphasis mb-6">
          {{ t('comingSoon') }}
        </p>
        <v-btn
          color="primary"
          variant="outlined"
          to="/datasets"
          prepend-icon="mdi-arrow-left"
        >
          {{ t('backToDatasets') }}
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
const { t } = useI18n()
</script>

<i18n lang="yaml">
fr:
  title: Partager un jeu de données
  comingSoon: Cette fonctionnalité sera disponible prochainement.
  backToDatasets: Retour aux jeux de données
en:
  title: Share a dataset
  comingSoon: This feature will be available soon.
  backToDatasets: Back to datasets
</i18n>
