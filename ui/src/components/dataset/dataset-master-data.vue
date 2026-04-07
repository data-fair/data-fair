<template>
  <div v-if="dataset">
    <p class="mb-4">
      {{ t('intro') }}
    </p>
    <div
      v-if="can('writeDescription')"
      class="d-flex justify-end mb-2"
    >
      <df-agent-chat-action
        action-id="configure-master-data"
        :visible-prompt="t('configurePrompt')"
        :hidden-context="configureContext"
        :title="t('configurePrompt')"
      />
    </div>
    <vjsf
      v-model="dataset.masterData"
      :schema="schema"
      :options="vjsfOptions"
      data-title="Master data"
      prefix-name="masterData_"
      :sub-agent="true"
    >
      <template #shareOrgs-before>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-2"
        >
          {{ t('shareOrgsHelp') }}
        </v-alert>
      </template>
      <template #singleSearchs-before>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-2"
        >
          {{ t('singleSearchsHelp') }}
        </v-alert>
      </template>
      <template #bulkSearchs-before>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-2"
        >
          {{ t('bulkSearchsHelp') }}
        </v-alert>
      </template>
      <template #virtualDatasets-before>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-2"
        >
          {{ t('virtualDatasetsHelp') }}
        </v-alert>
      </template>
      <template #standardSchema-before>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-2"
        >
          {{ t('standardSchemaHelp') }}
        </v-alert>
      </template>
    </vjsf>
  </div>
</template>

<i18n lang="yaml">
fr:
  intro: Transformez ce jeu de données en une donnée de référence et augmentez sa ré-utilisabilité dans de multiples contextes.
  shareOrgsHelp: Le partage à des partenaires affecte simplement la visibilité des actions liées à ces données de référence. Il est sans effet sur les permissions que vous devez définir séparément.
  singleSearchsHelp: Permettez à vos utilisateurs de récupérer une liste de résultats à partir d'une recherche textuelle sur une colonne de libellés. Cette fonctionnalité permet de créer des champs de recherche dans les formulaires d'édition de ligne des jeux éditables.
  bulkSearchsHelp: Permettez à vos utilisateurs de récupérer un grand nombre de lignes à partir d'une règle de correspondance simple. Cette fonctionnalité permet de créer une nouvelle source d'enrichissement.
  virtualDatasetsHelp: Proposez à vos utilisateurs de créer des jeux virtuels à partir de ce jeu de données. C'est une option intéressante pour faciliter la création de vues filtrées de cette donnée.
  standardSchemaHelp: Proposez à vos utilisateurs d'initialiser des jeux éditables à partir des métadonnées et des données de ce jeu de données.
  configurePrompt: Aide-moi à configurer les données de référence
en:
  intro: Transform this dataset into a master data source and increase its reusability in multiple contexts.
  shareOrgsHelp: Sharing with partners only affects the visibility of actions linked to this master data. It has no effect on permissions that you must define separately.
  singleSearchsHelp: Allow your users to retrieve a list of results from a text search on a label column. This feature allows creating search fields in editable dataset line editing forms.
  bulkSearchsHelp: Allow your users to retrieve a large number of lines from a simple matching rule. This feature creates a new enrichment source.
  virtualDatasetsHelp: Allow your users to create virtual datasets from this dataset. This is useful for creating filtered views of this data.
  standardSchemaHelp: Allow your users to initialize editable datasets from the metadata and data of this dataset.
  configurePrompt: Help me configure master data
</i18n>

<script setup lang="ts">
import Vjsf from '@koumoul/vjsf/webmcp'
import { type Options as VjsfOptions } from '@koumoul/vjsf'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { schema as masterDataSchema } from '../../../../api/contract/master-data.js'
import { $sitePath } from '../../context.js'

const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const schema = JSON.parse(JSON.stringify(masterDataSchema))

if (!dataset.value.masterData) {
  dataset.value.masterData = { standardSchema: {}, virtualDatasets: {}, singleSearchs: [], bulkSearchs: [] }
}

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
  context: context.value
}))
</script>
