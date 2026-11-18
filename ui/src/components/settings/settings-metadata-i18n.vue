<template>
  <div>
    <h3 class="text-title-medium">
      {{ t('title') }}
    </h3>
    <p class="text-body-medium">
      {{ t('subtitle') }}
    </p>
    <v-checkbox
      :model-value="!!model?.active"
      :label="t('toggle')"
      @update:model-value="v => model = { defaultLocale: 'fr', locales: [], ...model, active: !!v }"
    />
    <v-row
      v-if="model?.active"
      class="narrow-section"
    >
      <v-col cols="12">
        <v-select
          :model-value="model.defaultLocale ?? 'fr'"
          :items="items"
          :label="t('defaultLocale')"
          :hint="t('defaultLocaleHint')"
          persistent-hint
          variant="outlined"
          density="comfortable"
          @update:model-value="v => model = { ...model, defaultLocale: v, locales: (model?.locales ?? []).filter(l => l !== v) }"
        />
      </v-col>
      <v-col cols="12">
        <v-autocomplete
          :model-value="model.locales ?? []"
          :items="items.filter(i => i.value !== (model?.defaultLocale ?? 'fr'))"
          :label="t('locales')"
          :hint="t('localesHint')"
          persistent-hint
          variant="outlined"
          density="comfortable"
          multiple
          chips
          closable-chips
          @update:model-value="v => model = { ...model, locales: v }"
        />
      </v-col>
    </v-row>
  </div>
</template>

<i18n lang="yaml">
fr:
  title: Langues des métadonnées
  subtitle: Saisissez les métadonnées des jeux de données (titre, résumé, description, producteur, couverture géographique, mots-clés, pièces jointes, libellés des colonnes et des valeurs) en plusieurs langues. Les données elles-mêmes ne sont pas traduites.
  toggle: Activer les métadonnées multilingues
  defaultLocale: Langue par défaut
  defaultLocaleHint: Langue de saisie principale, utilisée quand une traduction manque.
  locales: Autres langues supportées
  localesHint: Chaque métadonnée traduisible pourra être saisie dans ces langues.
en:
  title: Metadata languages
  subtitle: Enter the datasets metadata (title, summary, description, producer, geographical coverage, keywords, attachments, column and value labels) in several languages. The data itself is not translated.
  toggle: Enable multilingual metadata
  defaultLocale: Default language
  defaultLocaleHint: Main editing language, used when a translation is missing.
  locales: Other supported languages
  localesHint: Every translatable metadata can be entered in these languages.
</i18n>

<script setup lang="ts">
const model = defineModel<{ active?: boolean, defaultLocale?: string, locales?: string[] } | undefined>()
const { t, locale } = useI18n()

const codes = ['fr', 'en', 'de', 'es', 'it', 'nl', 'pt', 'br', 'eu', 'ca', 'co', 'oc', 'ar']
const items = computed(() => {
  const names = new Intl.DisplayNames([locale.value], { type: 'language' })
  return codes.map(value => ({ value, title: `${names.of(value) ?? value} (${value})` }))
})
</script>

<style scoped>
.narrow-section { max-width: max(50%, 500px); }
</style>
