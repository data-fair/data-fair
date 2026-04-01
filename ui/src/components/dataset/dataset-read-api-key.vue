<template>
  <v-card variant="outlined">
    <v-card-title class="text-body-large">
      {{ t('title') }}
    </v-card-title>
    <v-card-text>
      <p class="text-body-medium mb-2">
        {{ t('description') }}
      </p>
      <v-alert
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        {{ t('warning') }}
      </v-alert>

      <v-form ref="formRef">
        <vjsf
          v-if="editReadApiKey"
          v-model="editReadApiKey"
          :schema="schema"
          :options="vjsfOptions"
        />
      </v-form>

      <template v-if="actualReadApiKey?.current">
        <p class="text-body-medium mt-2">
          {{ t('key') }}: <code>{{ actualReadApiKey.current }}</code>
          <span v-if="dataset?.readApiKey?.expiresAt">
            ({{ t('expiresAt') }} {{ formatDate(dataset.readApiKey.expiresAt) }})
          </span>
        </p>
        <p class="text-body-medium">
          {{ t('exampleUsage') }}:
          <a :href="exampleUrl">{{ exampleUrl }}</a>
        </p>
      </template>

      <div class="d-flex justify-end mt-4">
        <v-btn
          color="primary"
          :disabled="!hasChanges"
          :loading="saving"
          @click="save"
        >
          {{ t('save') }}
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  title: "Cle d'API en lecture"
  description: "Permettez a vos utilisateurs d'utiliser l'API de ce jeu de donnees en dehors d'une session. Cette fonctionnalite est utile par exemple pour consommer les donnees dans Excel."
  warning: "Cette fonctionnalite baisse la securisation de l'acces a ce jeu de donnees. Evitez de l'utiliser sur les donnees les plus sensibles. Si vous pensez que la cle a trop circule vous pouvez desactiver et re-activer l'acces pour forcer le renouvellement."
  save: Enregistrer
  key: Cle
  expiresAt: expirera le
  exampleUsage: "Exemple d'utilisation"
en:
  title: Read API key
  description: Allow your users to use the API of this dataset outside of a session. This feature is useful for example to consume data in Excel.
  warning: "This feature lowers the security of access to this dataset. Avoid using it on the most sensitive data. If you think the key has been shared too widely, you can deactivate and re-activate access to force renewal."
  save: Save
  key: Key
  expiresAt: expires on
  exampleUsage: Example usage
</i18n>

<script setup lang="ts">
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const { t, locale } = useI18n()
const { dataset, resourceUrl, patchDataset } = useDatasetStore()

const defaultReadApiKey = { active: false, interval: 'P1M' }

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    active: { type: 'boolean', title: "Activer l'acces par cle d'API", 'x-i18n': { en: { title: 'Enable API key access' } } },
    interval: {
      type: 'string',
      title: 'Duree de validite des cles',
      'x-i18n': { en: { title: 'Key validity duration' } },
      oneOf: [
        { const: 'P1W', title: '1 semaine', 'x-i18n': { en: { title: '1 week' } } },
        { const: 'P1M', title: '1 mois', 'x-i18n': { en: { title: '1 month' } } },
        { const: 'P1Y', title: '1 annee', 'x-i18n': { en: { title: '1 year' } } }
      ]
    },
    expiresAt: { type: 'string', format: 'date-time', readOnly: true, layout: 'none' },
    renewAt: { type: 'string', format: 'date-time', readOnly: true, layout: 'none' }
  }
}

const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}

const editReadApiKey = ref<any>(null)
const actualReadApiKey = ref<any>(null)
const saving = ref(false)

const hasChanges = computed(() => {
  return JSON.stringify(dataset.value?.readApiKey || defaultReadApiKey) !== JSON.stringify(editReadApiKey.value)
})

const exampleUrl = computed(() => {
  return `${resourceUrl.value}/lines?apiKey=${actualReadApiKey.value?.current}`
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

async function fetchReadApiKey () {
  try {
    actualReadApiKey.value = await $fetch(`datasets/${dataset.value!.id}/read-api-key`)
  } catch {
    actualReadApiKey.value = null
  }
}

async function save () {
  saving.value = true
  try {
    await patchDataset.execute({ readApiKey: editReadApiKey.value })
    if (editReadApiKey.value?.active) {
      await fetchReadApiKey()
    } else {
      actualReadApiKey.value = null
    }
  } finally {
    saving.value = false
  }
}

watch(() => dataset.value?.readApiKey, () => {
  editReadApiKey.value = JSON.parse(JSON.stringify(dataset.value?.readApiKey || defaultReadApiKey))
  if (dataset.value?.readApiKey?.active) fetchReadApiKey()
  else actualReadApiKey.value = null
}, { immediate: true })
</script>
