<template>
  <div v-if="dataset">
    <!-- Intro + agent chat action -->
    <div class="d-flex align-start mb-4">
      <p class="flex-grow-1 mr-2 mb-0">
        {{ t('intro') }}
      </p>
      <df-agent-chat-action
        v-if="can('writeDescription')"
        action-id="configure-master-data"
        :visible-prompt="t('configurePrompt')"
        :hidden-context="configureContext"
        :title="t('configurePrompt')"
      />
    </div>

    <v-form v-model="formValid">
      <vjsf
        v-model="dataset.masterData"
        :schema="schema"
        :options="vjsfOptions"
        data-title="Master data"
        prefix-name="masterData_"
        :sub-agent="true"
      />
    </v-form>
  </div>
</template>

<i18n lang="yaml">
fr:
  intro: Transformez ce jeu de données en une donnée de référence et augmentez sa ré-utilisabilité dans de multiples contextes.
  configurePrompt: Aide-moi à configurer les données de référence
en:
  intro: Transform this dataset into a master data source and increase its reusability in multiple contexts.
  configurePrompt: Help me configure master data
</i18n>

<script setup lang="ts">
import Vjsf from '@koumoul/vjsf/webmcp'
import { type Options as VjsfOptions } from '@koumoul/vjsf'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { schema as masterDataSchema } from '../../../../api/contract/master-data.js'
import { $sitePath } from '../../context.js'

const dataset = defineModel<any>({ required: true })
const emit = defineEmits<{
  'update:valid': [value: boolean]
}>()

const { t, locale } = useI18n()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const schema = JSON.parse(JSON.stringify(masterDataSchema))

const formValid = ref(true)
watch(formValid, (val) => {
  emit('update:valid', val)
})

const context = computed(() => ({
  dataset: dataset.value,
  directoryUrl: $sitePath + '/simple-directory',
  ownerOrg: dataset.value?.owner?.type === 'organization',
  stringProperties: dataset.value?.schema
    ?.filter((p: any) => p.type === 'string')
    .map((p: any) => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })) ?? [],
  filterProperties: dataset.value?.schema
    ?.filter((p: any) => !p['x-capabilities'] || p['x-capabilities'].index !== false)
    .map((p: any) => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })) ?? [],
  searchProperties: dataset.value?.schema
    ?.filter((p: any) => p.type === 'string' && (!p['x-capabilities'] || p['x-capabilities'].textStandard !== false))
    .map((p: any) => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })) ?? [],
  propertiesWithConcepts: dataset.value?.schema
    ?.filter((p: any) => p['x-refersTo'])
    .map((p: any) => ({ key: p.key, title: p.title || p['x-originalName'] || p.key, 'x-refersTo': p['x-refersTo'] })) ?? [],
  hasDateIntervalConcepts: !!(dataset.value?.schema?.find((p: any) => p['x-refersTo'] === 'https://schema.org/startDate') && dataset.value?.schema?.find((p: any) => p['x-refersTo'] === 'https://schema.org/endDate'))
}))

const configureContext = computed(() => {
  const lines = [
    'Use the subagent tool masterData_form to help the user configure the master data settings for the current dataset.',
    'Start the session by asking the user what they want to achieve.',
  ]
  if (dataset.value?.title) lines.push(`The dataset title is "${dataset.value.title}".`)
  if (dataset.value?.description) lines.push(`Dataset description: ${dataset.value.description}`)
  return lines.join(' ')
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  locale: locale.value,
  readOnly: !can('writeDescription'),
  context: context.value,
  density: 'comfortable'
}))
</script>
