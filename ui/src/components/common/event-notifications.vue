<template>
  <d-frame :src="iframeUrl" />
</template>

<script setup lang="ts">

const props = defineProps<{
  resource: {
    id: string,
    slug?: string,
    title: string,
    owner: { type: string, id: string, department?: string },
    isRest?: boolean,
    isVirtual?: boolean,
    isMetaOnly?: boolean
  }
  resourceType: 'dataset' | 'application'
}>()

const { t } = useI18n()

// Per-resource allow-list of subscribable topics. Deliberately not derived from the
// settings schema (`webhooks.items.properties.events.items.oneOf`): the per-resource
// widget is a UI decision (admin-only events leak otherwise), and the wording below
// uses the definite article ("Le ..." / "La ...") whereas the schema labels use the
// generic indefinite article ("Un ..." / "Une ...").
const topicsByResource = {
  dataset: [
    'dataset-data-updated',
    'dataset-structure-updated',
    'dataset-error',
    'dataset-breaking-change',
    // draft topic, conditionally included below
    'dataset-draft-data-updated'
  ],
  application: [
    'application-error'
  ]
} as const

const iframeUrl = computed(() => {
  // Drafts only exist on file-based datasets.
  const canHaveDraft = props.resourceType === 'dataset' &&
    !props.resource.isRest && !props.resource.isVirtual && !props.resource.isMetaOnly

  const topics = topicsByResource[props.resourceType]
    .filter(key => key !== 'dataset-draft-data-updated' || canHaveDraft)

  const keysParam = topics
    .map(key => `data-fair:${key}:${props.resource.slug}`)
    .join(',')

  // Commas are reserved as the multi-value separator on the events service side,
  // so we strip them defensively from individual titles.
  const titlesParam = topics
    .map(key => t(`topicsTitles.${key}`).replace(/,/g, ' '))
    .join(',')

  const urlTemplate = `${$siteUrl}/data-fair/${props.resourceType}/${props.resource.id}`

  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department

  const searchParams = new URLSearchParams({
    key: keysParam,
    title: titlesParam,
    'url-template': urlTemplate,
    sender,
    register: 'false'
  }).toString()

  return `${window.location.origin}/events/embed/subscribe?${searchParams}`
})
</script>

<i18n lang="yaml">
fr:
  topicsTitles:
    dataset-data-updated: "Les données du jeu de données ont été mises à jour"
    dataset-draft-data-updated: "Les données du jeu de données ont été mises à jour en mode brouillon"
    dataset-structure-updated: "La structure du jeu de données a été mise à jour"
    dataset-error: "Le jeu de données a rencontré une erreur"
    dataset-breaking-change: "Le jeu de données rencontre une rupture de compatibilité"
    application-error: "La visualisation a rencontré une erreur"
en:
  topicsTitles:
    dataset-data-updated: "Data of this dataset was updated"
    dataset-draft-data-updated: "Draft data of this dataset was updated"
    dataset-structure-updated: "Structure of this dataset was updated"
    dataset-error: "This dataset encountered an error"
    dataset-breaking-change: "This dataset has a breaking compatibility change"
    application-error: "This visualization encountered an error"
</i18n>
