<template>
  <div
    v-if="i18n?.config.value"
    class="d-inline-flex align-center ga-1 mr-2"
    style="vertical-align: middle"
  >
    <df-agent-chat-action
      v-if="!i18n.isDefault.value && showAgentChat && translatePrompt"
      action-id="translate-dataset"
      :visible-prompt="t('translatePrompt', { lang: localeName })"
      :hidden-context="translateContext"
      :title="t('translatePrompt', { lang: localeName })"
    />
    <v-btn-toggle
      v-model="i18n.editLocale.value"
      mandatory
      density="compact"
      variant="outlined"
      divided
      :title="t('editLocale')"
    >
      <v-btn
        v-for="l of i18n.config.value.locales"
        :key="l"
        :value="l"
        size="small"
      >
        {{ l.toUpperCase() }}
        <v-badge
          v-if="l !== i18n.config.value.defaultLocale && counts?.(l)"
          :content="`${counts(l).done}/${counts(l).total}`"
          :color="counts(l).done === counts(l).total ? 'success' : 'warning'"
          inline
        />
      </v-btn>
    </v-btn-toggle>
  </div>
</template>

<i18n lang="yaml">
fr:
  editLocale: Langue d'édition des métadonnées
  translatePrompt: "Traduis en {lang}"
en:
  editLocale: Metadata editing language
  translatePrompt: "Translate into {lang}"
</i18n>

<script setup lang="ts">
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useMetadataI18n } from '~/composables/dataset/metadata-i18n'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'

const props = defineProps<{
  counts?: (locale: string) => { done: number, total: number }
  // what the assistant translates from this section
  translatePrompt?: 'metadata' | 'structure'
}>()

const { t, locale } = useI18n()
const i18n = useMetadataI18n()
const showAgentChat = useShowAgentChat()

const localeName = computed(() => new Intl.DisplayNames([locale.value], { type: 'language' }).of(i18n?.editLocale.value ?? '') ?? '')
const translateContext = computed(() => {
  const target = i18n?.editLocale.value
  const source = i18n?.config.value?.defaultLocale
  const scope = props.translatePrompt === 'structure'
    ? 'the column titles, the column descriptions and the value labels (x-labels) of the schema'
    : 'the metadata card texts (title, summary, description, producer, geographical coverage, keywords and free text custom metadata)'
  return `Following the translate-dataset skill, translate ${scope} of this dataset from "${source}" into "${target}". Read the current texts and translations with read_dataset_translations, write every translation in one call to set_dataset_translations with locale "${target}". Do not translate the data values themselves, only their labels. Then tell the user the translations are in the form, highlighted, and that they can review them before clicking Enregistrer.`
})
</script>
