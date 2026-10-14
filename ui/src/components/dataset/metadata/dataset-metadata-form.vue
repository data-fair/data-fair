<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <vjsf
      v-if="dataset"
      :model-value="vjsfModel"
      :schema="schema"
      :options="vjsfOptions"
      @update:model-value="onUpdate"
    >
      <!-- named slots: the agent chat buttons are components, a schema cannot express them -->
      <template #summary-action>
        <df-agent-chat-action
          action-id="summarize-dataset"
          :visible-prompt="t('summarizePrompt')"
          :hidden-context="summarizeContext"
          :btn-props="{ class: 'ml-n2', style: 'max-width: none' }"
          :title="t('summarizePrompt')"
        />
      </template>
      <template #describe-action>
        <df-agent-chat-action
          action-id="describe-dataset"
          :visible-prompt="t('describePrompt')"
          :hidden-context="describeContext"
          :btn-props="{ class: 'ml-n2 mt-6', style: 'max-width: none' }"
          :title="t('describePrompt')"
        />
      </template>
      <template #search-terms-action>
        <df-agent-chat-action
          action-id="suggest-search-terms"
          :visible-prompt="t('searchTermsPrompt')"
          :hidden-context="searchTermsContext"
          :btn-props="{ class: 'ml-n2', style: 'max-width: none' }"
          :title="t('searchTermsPrompt')"
        />
      </template>
    </vjsf>
  </v-defaults-provider>
</template>

<i18n lang="yaml">
fr:
  title: Titre
  summary: Résumé
  summarizePrompt: Aide-moi à rédiger un résumé pour ce jeu de données
  description: Description
  describePrompt: Aide-moi à rédiger une description pour ce jeu de données
  license: Licence
  topics: Thématiques
  origin: Provenance
  originHelp: Adresse de la page où les données d'origine sont publiées, par exemple sur le site du producteur.
  image: Adresse d'une image utilisée comme vignette
  keywords: Mots-clés
  searchTerms: Termes de recherche associés
  searchTermsHelp: "Texte libre utilisé uniquement par la recherche du catalogue, jamais affiché : synonymes, sigles et leur développement, formulations courantes. Ce champ n'est affiché nulle part mais reste présent dans la réponse API publique du jeu de données : n'y mettez rien de confidentiel."
  searchTermsPrompt: Aide-moi à trouver des termes de recherche pour ce jeu de données
  projection: Système de coordonnées
  creator: Producteur
  frequency: Fréquence de mise à jour
  frequencyItems:
    triennial: Tous les 3 ans
    biennial: Tous les 2 ans
    annual: Tous les ans
    semiannual: 2 fois par an
    threeTimesAYear: 3 fois par an
    quarterly: Chaque trimestre
    bimonthly: Tous les 2 mois
    monthly: Tous les mois
    semimonthly: 2 fois par mois
    biweekly: Toutes les 2 semaines
    threeTimesAMonth: 3 fois par mois
    weekly: Chaque semaine
    semiweekly: 2 fois par semaine
    threeTimesAWeek: 3 fois par semaine
    daily: Tous les jours
    continuous: En continu
    irregular: Irrégulière
  spatial: Couverture géographique
  temporal: Couverture temporelle
  modified: Date de modification de la source
  modifiedHelp: "Date à laquelle les données ont été modifiées à leur source, quand elle diffère de leur date de chargement dans Data Fair. Elle sert au tri des jeux de données par date de mise à jour, notamment sur les portails : laissée vide, c'est la date de la dernière mise à jour des données qui est utilisée."
  relatedDatasets: Jeux de données liés
  start: début
  end: fin
  url: URL
  linkTitle: Libellé du lien
  seeAlsoDescription: Sélectionnez d'autres jeux de données proches (même thématique, structure similaire, ou autre critère) pour les proposer aux utilisateurs de portails.
en:
  title: Title
  summary: Summary
  summarizePrompt: Help me write a summary for this dataset
  description: Description
  describePrompt: Help me write a description for this dataset
  license: License
  topics: Topics
  origin: Origin
  originHelp: Address of the page where the original data is published, for example on the producer's website.
  image: URL of an image used as thumbnail
  keywords: Keywords
  searchTerms: Search terms
  searchTermsHelp: "Free text used only by the catalog search, never displayed: synonyms, acronyms with their expansion, everyday wording. Not shown anywhere, but present in the dataset's public API response — do not put anything confidential here."
  searchTermsPrompt: Help me find search terms for this dataset
  projection: Coordinate reference system
  creator: Producer
  frequency: Update frequency
  frequencyItems:
    triennial: Every 3 years
    biennial: Every 2 years
    annual: Every year
    semiannual: Twice a year
    threeTimesAYear: 3 times a year
    quarterly: Every quarter
    bimonthly: Every 2 months
    monthly: Every month
    semimonthly: Twice a month
    biweekly: Every 2 weeks
    threeTimesAMonth: 3 times a month
    weekly: Every week
    semiweekly: Twice a week
    threeTimesAWeek: 3 times a week
    daily: Every day
    continuous: Continuous
    irregular: Irregular
  spatial: Geographic coverage
  temporal: Temporal coverage
  modified: Source modification date
  modifiedHelp: "Date the data was modified at its source, when it differs from the date it was loaded into Data Fair. It is used to sort datasets by update date, on portals in particular: left empty, the date of the last data update is used."
  relatedDatasets: Related datasets
  start: start
  end: end
  url: URL
  linkTitle: Link label
  seeAlsoDescription: Select other related datasets (same topic, similar structure, or other criteria) to suggest to portal users.
</i18n>

<script setup lang="ts">
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import VjsfMarkdown from '@koumoul/vjsf-markdown'
import equal from 'fast-deep-equal'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { fieldGroup, customGroup } from '~/utils/metadata-groups'
import { customMetadataSchema, isCustomMetadataEmpty } from '#api/types'

const dataset = defineModel<any>({ required: true })
// custom metadata are flat "customMetadata.<key>" properties, so they share the 2 columns grid of the fixed ones
const prefix = 'customMetadata.'
const flatten = (d: any) => d && { ...d, ...Object.fromEntries(Object.entries(d.customMetadata ?? {}).map(([k, v]) => [prefix + k, v])) }
// vjsf re-emits whatever it would drop (keys outside the schema, empty strings): it only gets the schema fields with a value
const vjsfModel = computed(() => {
  const flat = flatten(dataset.value)
  return Object.fromEntries(Object.keys(schema.value.properties).filter(key => flat?.[key] != null && flat[key] !== '').map(key => [key, flat[key]]))
})
const onUpdate = (value: any) => {
  const changed = Object.keys(schema.value.properties).filter(key => !equal(value[key], vjsfModel.value[key]))
  // the schema depends on the dataset: vjsf re-emits after each replacement, an unchanged emit must stop there
  if (!changed.length) return
  const next = { ...dataset.value, customMetadata: { ...dataset.value.customMetadata } }
  for (const key of changed) {
    if (!key.startsWith(prefix)) next[key] = value[key] ?? null // null so the patch unsets it
    else if (isCustomMetadataEmpty(value[key])) delete next.customMetadata[key.slice(prefix.length)]
    else next.customMetadata[key.slice(prefix.length)] = value[key]
  }
  if (!dataset.value.customMetadata && !Object.keys(next.customMetadata).length) delete next.customMetadata
  dataset.value = next
}

const { t, locale } = useI18n()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const props = withDefaults(defineProps<{
  required?: string[]
  serverData?: any
  // owner settings, fetched once by the page rather than by each tab
  datasetsMetadata?: Record<string, any> | null
  // tab of the metadata section, every field is shown without it
  group?: string
}>(), { required: () => [] })

const inTab = (field: string) => !props.group || fieldGroup(props.datasetsMetadata, field) === props.group
const owner = computed(() => dataset.value?.owner)
// fetched here rather than by getItems: the field is hidden when the owner has no topic
const topicsFetch = useFetch<any[]>(() => owner.value && inTab('topics') ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/topics` : null)

// accent colour on a field that differs from the saved dataset
const accent = (path: string) => ({
  getProps: `context.saved && JSON.stringify(data ?? null) !== JSON.stringify(context.saved${path} ?? null) ? { ...layout.props, baseColor: 'accent', color: 'accent' } : layout.props`
})
const facet = (name: string, results = '') => ({
  url: `api/v1/datasets?size=0&facets=${name}&owner=${owner.value?.type}:${owner.value?.id}`,
  itemsResults: `data.facets.${name}${results} ?? []`
})
// https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
const frequencyKeys = [
  'triennial', 'biennial', 'annual', 'semiannual', 'threeTimesAYear', 'quarterly',
  'bimonthly', 'monthly', 'semimonthly', 'biweekly', 'threeTimesAMonth', 'weekly',
  'semiweekly', 'threeTimesAWeek', 'daily', 'continuous', 'irregular'
].reverse()

const fixedProperties = () => {
  const dm = props.datasetsMetadata
  const ownerPath = `${owner.value?.type}/${owner.value?.id}`
  const properties: Record<string, any> = {
    license: {
      type: 'object',
      title: t('license'),
      layout: { comp: 'select', getItems: { url: `api/v1/settings/${ownerPath}/licenses`, itemKey: 'item.href', itemTitle: 'item.title', itemValue: '({ title: item.title, href: item.href })' }, ...accent('.license') }
    },
    creator: dm?.creator?.active && { type: 'string', title: dm.creator.title || t('creator'), layout: accent('.creator') },
    origin: { type: 'string', title: t('origin'), description: t('originHelp'), layout: accent('.origin') },
    image: { type: 'string', title: t('image'), layout: accent('.image') },
    spatial: dm?.spatial?.active && {
      type: 'string',
      title: dm.spatial.title || t('spatial'),
      layout: { comp: 'combobox', getItems: facet('spatial'), ...accent('.spatial') }
    },
    temporal: dm?.temporal?.active && {
      type: 'object',
      properties: {
        start: { type: 'string', format: 'date', title: `${dm.temporal.title || t('temporal')} - ${t('start')}`, layout: { cols: { sm: 6 }, ...accent('.temporal?.start') } },
        end: { type: 'string', format: 'date', title: `${dm.temporal.title || t('temporal')} - ${t('end')}`, layout: { cols: { sm: 6 }, ...accent('.temporal?.end') } }
      }
    },
    frequency: dm?.frequency?.active && {
      type: 'string',
      title: dm.frequency.title || t('frequency'),
      oneOf: frequencyKeys.map(key => ({ const: key, title: t(`frequencyItems.${key}`) })),
      layout: accent('.frequency')
    },
    modified: dm?.modified?.active && { type: 'string', format: 'date', title: dm.modified.title || t('modified'), description: t('modifiedHelp'), layout: accent('.modified') },
    topics: !!topicsFetch.data.value?.length && {
      type: 'array',
      title: t('topics'),
      items: { type: 'object' },
      layout: { getItems: { expr: 'context.topics', returnObjects: true, itemKey: 'item.id', itemTitle: 'item.title', itemIcon: "item.icon?.svgPath && 'svg:' + item.icon.svgPath" }, ...accent('.topics') }
    },
    keywords: dm?.keywords?.active && {
      type: 'array',
      title: t('keywords'),
      items: { type: 'string' },
      layout: { comp: 'combobox', getItems: facet('keywords'), ...accent('.keywords') }
    },
    searchTerms: dm?.searchTerms?.active !== false && {
      type: 'string',
      title: dm?.searchTerms?.title || t('searchTerms'),
      description: t('searchTermsHelp'),
      maxLength: 1000,
      layout: { comp: 'textarea', props: { rows: 1, counter: 1000 }, ...accent('.searchTerms'), ...(can('writeDescription') && { slots: { append: { name: 'search-terms-action' } } }) }
    },
    relatedDatasets: (dataset.value?.finalizedAt || dataset.value?.isMetaOnly) && {
      type: 'array',
      title: t('relatedDatasets'),
      description: t('seeAlsoDescription'),
      items: { type: 'object' },
      layout: {
        comp: 'autocomplete',
        getItems: {
          url: `api/v1/datasets?owner=${owner.value?.type}:${owner.value?.id}&size=20&select=id,title`,
          qSearchParam: 'q',
          itemsResults: 'data.results.filter(d => d.id !== context.datasetId)',
          itemKey: 'item.id',
          itemTitle: 'item.title',
          itemValue: '({ id: item.id, title: item.title })'
        },
        ...accent('.relatedDatasets')
      }
    }
  }
  return Object.fromEntries(Object.entries(properties).filter(([key, prop]) => prop && inTab(key)))
}

const customProperties = () => {
  const definitions = (props.datasetsMetadata?.custom ?? []).filter((c: any) => !props.group || customGroup(props.datasetsMetadata, c.key) === props.group)
  const properties: Record<string, any> = {}
  for (const [key, prop] of Object.entries<any>(customMetadataSchema(definitions).properties)) {
    const path = `[${JSON.stringify(prefix + key)}]`
    properties[prefix + key] = prop
    if (prop.type === 'object') { // a link, url and label side by side
      prop.properties.url.title = `${prop.title} - ${t('url')}`
      prop.properties.url.layout = { cols: { sm: 6 }, ...accent(path + '?.url') }
      prop.properties.title.title = `${prop.title} - ${t('linkTitle')}`
      prop.properties.title.layout = { cols: { sm: 6 }, ...accent(path + '?.title') }
      prop.layout = { title: null, cols: 12 }
      prop.description = undefined
      continue
    }
    const list = prop.enum ?? prop.items?.enum
    const text = prop.type === 'string' || prop.items?.type === 'string'
    prop.layout = {
      cols: { sm: 6 },
      ...accent(path),
      // values already entered on the owner's other datasets
      ...(text && !list && !prop.format && { comp: 'combobox', getItems: facet('customMetadata', `?.[${JSON.stringify(key)}]?.values`) })
    }
  }
  return properties
}

const schema = computed(() => {
  const main = inTab('title')
  const properties: Record<string, any> = {}
  if (main) {
    properties.title = { type: 'string', title: t('title'), layout: { props: { variant: 'outlined' }, ...accent('.title') } }
    properties.summary = { type: 'string', title: t('summary'), layout: { comp: 'textarea', props: { rows: 3, variant: 'outlined' }, ...accent('.summary'), ...(can('writeDescription') && { slots: { append: { name: 'summary-action' } } }) } }
    properties.description = { type: 'string', title: t('description'), layout: { comp: 'markdown', props: { centerAffix: false }, ...(can('writeDescription') && { slots: { append: { name: 'describe-action' } } }) } }
  }
  // a fragment is never published: the catalog metadata would describe nothing anyone sees
  const secondary = dataset.value?.partOf ? {} : fixedProperties()
  if (!dataset.value?.partOf) Object.assign(secondary, customProperties())
  Object.assign(properties, secondary)
  const fullRow = (key: string) => key === 'temporal' || secondary[key].layout?.cols === 12
  const secondaryKeys = Object.keys(secondary)
  return {
    type: 'object',
    required: props.required.map(r => r.startsWith('custom.') ? prefix + r.slice(7) : r).filter(r => r in properties),
    properties,
    // informations: main fields on the left, the others on the right; other tabs: a 2 columns grid
    layout: main
      ? [
          { children: ['title', 'summary', 'description'], cols: secondaryKeys.length ? { sm: 7 } : 12 },
          ...(secondaryKeys.length ? [{ children: secondaryKeys, cols: { sm: 5 } }] : [])
        ]
      : secondaryKeys.map(key => ({ key, cols: fullRow(key) ? 12 : { sm: 6 } }))
  }
})

const fetched: Record<string, Promise<any>> = {}
const vjsfOptions = computed<VjsfOptions>(() => ({
  density: 'comfortable',
  locale: locale.value,
  readOnly: !can('writeDescription'),
  fetchBaseURL: $sitePath + '/data-fair/',
  // the facets feeding several suggestion lists are fetched once
  fetch: (url: string) => (fetched[url] = fetched[url] ?? $fetch(url)),
  context: {
    datasetId: dataset.value?.id,
    topics: topicsFetch.data.value,
    saved: props.serverData && flatten(props.serverData)
  },
  // help texts come from owner settings: shown as plain text, like the help-tooltip they replace
  markdown: (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`),
  plugins: [VjsfMarkdown],
  pluginsOptions: { markdown: { cspNonce: $cspNonce } }
}))

const summarizeContext = 'Use the dataset_summarizer subagent to produce a summary for this dataset. Once you receive the summary, present it to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (summary field). If the user wants changes, adjust accordingly.'

const describeContext = 'The user wants help writing a description for this dataset. The description field supports markdown and should be more detailed than the summary. Ask the user what aspects they want to emphasize or if they have any specific requirements before using the dataset_description_writer subagent. Once you receive the description, present it to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (description field). If the user wants changes, adjust accordingly.'

const searchTermsContext = 'Use the search_terms_writer subagent to propose hidden search terms for this dataset (synonyms, acronyms with their expansion, everyday wording — never displayed, only used by the catalog search). Present the list to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (searchTerms field, one line of terms separated by commas or newlines). If the user wants changes, adjust accordingly.'
</script>
