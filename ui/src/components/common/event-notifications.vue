<template>
  <d-frame :src="iframeUrl" />
</template>

<script setup lang="ts">
import settingsSchema from '../../../../api/types/settings/schema.js'

const props = defineProps<{
  // `integrity` rides along on a dataset: the integrity topics only exist for an enrolled one.
  // It is stripped from the API response for anyone without readIntegrity, so a user who cannot
  // see the verdict cannot subscribe to it either — the gate falls out of the projection.
  resource: {
    id: string,
    slug?: string,
    title: string,
    owner: { type: string, id: string, department?: string },
    integrity?: { active?: boolean },
    isRest?: boolean,
    isVirtual?: boolean,
    isMetaOnly?: boolean
  }
  resourceType: 'dataset' | 'application'
}>()

const webhooksSchema = settingsSchema.properties.webhooks

const { t } = useI18n()

const iframeUrl = computed(() => {
  // Drafts only exist on file-based datasets.
  const canHaveDraft = props.resourceType === 'dataset' &&
    !props.resource.isRest && !props.resource.isVirtual && !props.resource.isMetaOnly
  const webhooks = webhooksSchema.items.properties.events.items.oneOf
    .filter((item: any) => {
      if (!item.const.startsWith(props.resourceType)) return false
      if (item.const === 'dataset-dataset-created') return false
      if (item.const === 'dataset-finalize-end') return false
      if (item.const === 'application-application-created') return false
      // only on a dataset that is actually enrolled: offering "integrity breached" on a dataset
      // with no integrity would be a subscription that can never fire
      if (item.const.startsWith('dataset-integrity-')) return !!props.resource.integrity?.active
      if (item.const === 'dataset-draft-data-updated' && !canHaveDraft) return false
      // data-updated is not emitted on REST line operations (per-write notifications would
      // spam any script polling/editing on a regular cadence). The topic remains valid for
      // file-based and virtual datasets.
      if (item.const === 'dataset-data-updated' && props.resourceType === 'dataset' && props.resource.isRest) return false
      return true
    })
  // subscribe by stable id (not slug — slugs change on rename); the portal app does the same.
  const keysParam = webhooks.map((w: any) => `data-fair:${w.const}:${props.resource.id}`).join(',')
  // on a resource page we use the definite article ("Le ..."); fall back to the generic schema title.
  const resourceTitle = (key: string): string | undefined => {
    const i18nKey = `resourceTitles.${key}`
    const translated = t(i18nKey)
    return translated === i18nKey ? undefined : translated
  }
  const titlesParam = webhooks.map((w: any) => (resourceTitle(w.const) ?? w.title).replace(/,/g, ' ')).join(',')
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
  resourceTitles:
    dataset-data-updated: "Les données du jeu de données ont été mises à jour"
    dataset-draft-data-updated: "Les données du jeu de données ont été mises à jour en mode brouillon"
    dataset-structure-updated: "La structure du jeu de données a été mise à jour"
    dataset-error: "Le jeu de données a rencontré une erreur"
    dataset-breaking-change: "Le jeu de données rencontre une rupture de compatibilité"
    application-error: "La visualisation a rencontré une erreur"
en:
  resourceTitles:
    dataset-data-updated: "Data of this dataset was updated"
    dataset-draft-data-updated: "Draft data of this dataset was updated"
    dataset-structure-updated: "Structure of this dataset was updated"
    dataset-error: "This dataset encountered an error"
    dataset-breaking-change: "This dataset has a breaking compatibility change"
    application-error: "This visualization encountered an error"
</i18n>
