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
  summarizePrompt: Aide-moi à rédiger un résumé pour ce jeu de données
  describePrompt: Aide-moi à rédiger une description pour ce jeu de données
  searchTermsPrompt: Aide-moi à trouver des termes de recherche pour ce jeu de données
  url: URL
  linkTitle: Libellé du lien
en:
  summarizePrompt: Help me write a summary for this dataset
  describePrompt: Help me write a description for this dataset
  searchTermsPrompt: Help me find search terms for this dataset
  url: URL
  linkTitle: Link label
</i18n>

<script setup lang="ts">
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import VjsfMarkdown from '@koumoul/vjsf-markdown'
import equal from 'fast-deep-equal'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { fieldGroup, customGroup } from '~/utils/metadata-groups'
import { customMetadataSchema, isCustomMetadataEmpty } from '#api/types'
import datasetSchema from '~/../../api/types/dataset/schema.js'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'

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
const mainFields = ['title', 'summary', 'description']
const showAgentChat = useShowAgentChat()
// an empty slot would still reserve its room next to the field
const appendSlot = (name: string) => can('writeDescription') && showAgentChat.value ? { slots: { append: { name } } } : {}
const localized = (prop: any) => prop['x-i18n-title']?.[locale.value] ?? prop.title

// titles, help texts and static layout come from the dataset schema, this adds the owner's choices and the page's actions
const fixedProperties = () => {
  const dm = props.datasetsMetadata
  const ownerPath = `${owner.value?.type}/${owner.value?.id}`
  const fields: Record<string, any> = {
    title: {},
    summary: appendSlot('summary-action'),
    description: appendSlot('describe-action'),
    license: { comp: 'select', getItems: { url: `api/v1/settings/${ownerPath}/licenses`, itemKey: 'item.href', itemTitle: 'item.title', itemValue: '({ title: item.title, href: item.href })' } },
    creator: dm?.creator?.active && {},
    origin: {},
    image: {},
    spatial: dm?.spatial?.active && { comp: 'combobox', getItems: facet('spatial') },
    temporal: dm?.temporal?.active && {},
    frequency: dm?.frequency?.active && {},
    modified: dm?.modified?.active && {},
    topics: !!topicsFetch.data.value?.length && { getItems: { expr: 'context.topics', returnObjects: true, itemKey: 'item.id', itemTitle: 'item.title', itemIcon: "item.icon?.svgPath && 'svg:' + item.icon.svgPath" } },
    keywords: dm?.keywords?.active && { comp: 'combobox', getItems: facet('keywords') },
    searchTerms: dm?.searchTerms?.active !== false && appendSlot('search-terms-action'),
    relatedDatasets: (dataset.value?.finalizedAt || dataset.value?.isMetaOnly) && {
      comp: 'autocomplete',
      getItems: {
        url: `api/v1/datasets?owner=${owner.value?.type}:${owner.value?.id}&size=20&select=id,title`,
        qSearchParam: 'q',
        itemsResults: 'data.results.filter(d => d.id !== context.datasetId)',
        itemKey: 'item.id',
        itemTitle: 'item.title',
        itemValue: '({ id: item.id, title: item.title })'
      }
    }
  }
  const properties: Record<string, any> = {}
  for (const [key, layout] of Object.entries(fields)) {
    // a fragment is never published: the catalog metadata would describe nothing anyone sees
    if (!layout || !inTab(key) || (dataset.value?.partOf && !mainFields.includes(key))) continue
    const prop = properties[key] = structuredClone((datasetSchema as any).properties[key])
    // the main fields' descriptions only document the API, their labels say enough in the form
    if (mainFields.includes(key)) delete prop.description
    // the owner settings can rename a field
    if (dm?.[key]?.title) {
      prop.title = dm[key].title
      delete prop['x-i18n-title']
    }
    if (key === 'temporal') {
      // no section heading: each date names the coverage it bounds, as its accessible label must
      prop.layout = { title: null }
      for (const bound of ['start', 'end']) {
        const date = prop.properties[bound]
        date.title = `${localized(prop)} - ${localized(date).toLowerCase()}`
        delete date['x-i18n-title']
        Object.assign(date.layout, accent(`.temporal?.${bound}`))
      }
    }
    prop.layout = { ...prop.layout, ...layout, ...(!['temporal', 'description'].includes(key) && accent('.' + key)) }
  }
  // the topic $ref cannot be resolved here, the choices come from getItems
  if (properties.topics) properties.topics.items = { type: 'object' }
  // '' stays valid for the API, the form clears a frequency with null
  if (properties.frequency) properties.frequency.oneOf = properties.frequency.oneOf.filter((o: any) => o.const)
  return properties
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
  const properties: Record<string, any> = { ...fixedProperties(), ...(!dataset.value?.partOf && customProperties()) }
  const fullRow = (key: string) => key === 'temporal' || properties[key].layout?.cols === 12
  const secondaryKeys = Object.keys(properties).filter(key => !mainFields.includes(key))
  return {
    type: 'object',
    required: props.required.map(r => r.startsWith('custom.') ? prefix + r.slice(7) : r).filter(r => r in properties),
    properties,
    // informations: main fields on the left, the others on the right; other tabs: a 2 columns grid
    layout: inTab('title')
      ? [
          { children: mainFields, cols: secondaryKeys.length ? { sm: 7 } : 12 },
          ...(secondaryKeys.length ? [{ children: secondaryKeys, cols: { sm: 5 } }] : [])
        ]
      : secondaryKeys.map(key => ({ key, cols: fullRow(key) ? 12 : { sm: 6 } }))
  }
})

const fetched: Record<string, Promise<any>> = {}
const vjsfOptions = computed<VjsfOptions>(() => ({
  density: 'comfortable',
  locale: locale.value,
  xI18n: true,
  readOnly: !can('writeDescription'),
  fetchBaseURL: $sitePath + '/data-fair/',
  // the facets feeding several suggestion lists are fetched once
  fetch: (url: string) => (fetched[url] = fetched[url] ?? $fetch(url)),
  context: {
    datasetId: dataset.value?.id,
    topics: topicsFetch.data.value,
    saved: props.serverData && flatten(props.serverData)
  },
  // help texts come from owner settings: plain text with its line breaks, like the help-tooltip they replace
  markdown: (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`).replace(/\n/g, '<br>'),
  plugins: [VjsfMarkdown],
  pluginsOptions: { markdown: { cspNonce: $cspNonce } }
}))

const summarizeContext = 'Use the dataset_summarizer subagent to produce a summary for this dataset. Once you receive the summary, present it to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (summary field). If the user wants changes, adjust accordingly.'

const describeContext = 'The user wants help writing a description for this dataset. The description field supports markdown and should be more detailed than the summary. Ask the user what aspects they want to emphasize or if they have any specific requirements before using the dataset_description_writer subagent. Once you receive the description, present it to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (description field). If the user wants changes, adjust accordingly.'

const searchTermsContext = 'Use the search_terms_writer subagent to propose hidden search terms for this dataset (synonyms, acronyms with their expansion, everyday wording — never displayed, only used by the catalog search). Present the list to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (searchTerms field, one line of terms separated by commas or newlines). If the user wants changes, adjust accordingly.'
</script>
