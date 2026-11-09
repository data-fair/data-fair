<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editDatasetsMetadata"
        :schema="metadataFormSchema"
        :options="vjsfOptions"
      >
        <template #metadata-score>
          <settings-metadata-score
            v-if="datasetsMetadata?.completeness?.active"
            :shares="shares"
          />
        </template>
        <template #metadata-info="{ node }">
          <div class="text-body-small">
            {{ metadataByKey[node.data.key]?.info }}
          </div>
        </template>
      </vjsf>
    </v-form>
  </v-defaults-provider>
</template>

<i18n lang="yaml">
fr:
  notOffered: Non proposée
  customHelp: Infobulle personnalisée
  category: "Catégorie : {title}"
  weight: "Poids {weight}"
  informations: Informations générales
  coverage: Informations complémentaires
  keyPrefix: "Clé : "
  categoryPrefix: "Catégorie : "
  typeString: Texte
  typeInteger: Nombre entier
  typeNumber: Nombre
  typeDate: Date
  typeLink: Lien
  withEnum: ", liste de valeurs"
  withMultiple: ", plusieurs valeurs"
  unitChars: caractères
  unitValues: valeurs
en:
  notOffered: Not offered
  customHelp: Custom help
  category: "Category: {title}"
  weight: "Weight {weight}"
  informations: General information
  coverage: Additional information
  keyPrefix: "Key: "
  categoryPrefix: "Category: "
  typeString: Text
  typeInteger: Integer
  typeNumber: Number
  typeDate: Date
  typeLink: Link
  withEnum: ", list of values"
  withMultiple: ", multiple values"
  unitChars: characters
  unitValues: values
</i18n>

<script setup lang="ts">
import { type Settings, completenessCriteria } from '#api/types'
import equal from 'fast-deep-equal'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import { fieldGroup } from '~/utils/metadata-groups'
import { fromMetadataForm, localizedMetadata, metadataFormSchema, standardMetadata, standardMetadataItems, toMetadataForm } from '~/utils/settings-metadata-form'

const datasetsMetadata = defineModel<Settings['datasetsMetadata']>()
const valid = defineModel<boolean>('valid', { default: true })
const editDatasetsMetadata = ref<Record<string, any>>()
// both sides go through the form: an activation stored at its default, by an older version, is no edit either
const sameMetadata = (form: Record<string, any>) => equal(fromMetadataForm(form), fromMetadataForm(toMetadataForm(datasetsMetadata.value)))
watchDeepDiff(datasetsMetadata, () => {
  // a new model resets vjsf and closes the edit dialog: its own changes are not sent back
  if (editDatasetsMetadata.value && sameMetadata(editDatasetsMetadata.value)) return
  editDatasetsMetadata.value = toMetadataForm(datasetsMetadata.value)
}, { immediate: true })
watchDeepDiff(editDatasetsMetadata, () => {
  // a new category gets its key at once, so a metadata can pick it before the settings are saved
  const groups: { key?: string }[] | undefined = editDatasetsMetadata.value?.groups
  if (groups?.some(g => !g.key)) {
    editDatasetsMetadata.value = { ...editDatasetsMetadata.value, groups: groups.map(g => g.key ? g : { ...g, key: Math.random().toString(36).slice(2, 10) }) }
    return
  }
  if (!sameMetadata(editDatasetsMetadata.value!)) datasetsMetadata.value = fromMetadataForm(editDatasetsMetadata.value!) as Settings['datasetsMetadata']
}, {})
const { t, locale } = useI18n()

const metadataByKey = computed(() => localizedMetadata(locale.value))
const labels = computed(() => ({
  groups: { informations: t('informations'), coverage: t('coverage') },
  key: t('keyPrefix'),
  category: t('categoryPrefix'),
  types: { string: t('typeString'), integer: t('typeInteger'), number: t('typeNumber'), date: t('typeDate'), link: t('typeLink') },
  enum: t('withEnum'),
  multiple: t('withMultiple'),
  units: { chars: t('unitChars'), values: t('unitValues') }
}))

// the share of the score each metadata carries
const shares = computed(() => {
  const metadata = datasetsMetadata.value as Record<string, any> | undefined
  if (!metadata?.completeness?.active) return []
  const criteria = completenessCriteria({}, metadata)
  const total = criteria.reduce((sum, c) => sum + c.weight, 0)
  return criteria.map(c => ({
    // a custom metadata can share the key of a fixed one
    key: c.custom ? `custom.${c.key}` : c.key,
    title: (c.custom ? metadata.custom?.find((m: any) => m.key === c.key)?.title : metadata[c.key]?.title || metadataByKey.value[c.key]?.title) as string,
    weight: c.weight,
    share: c.weight / total
  })).sort((a, b) => b.share - a.share)
})

const scoreLabel = (key: string) => {
  const share = shares.value.find(s => s.key === key)
  return `${t('weight', { weight: share?.weight ?? 0 })} (${Math.round((share?.share ?? 0) * 100)} %)`
}

const metadataSubtitles = computed(() => {
  const metadata = (datasetsMetadata.value ?? {}) as Record<string, any>
  const tabTitle = (key: string) => {
    if (key === 'informations') return metadata.informationsTitle || t('informations')
    if (key === 'coverage') return metadata.coverageTitle || t('coverage')
    return metadata.groups?.find((g: any) => g.key === key)?.title
  }
  return Object.fromEntries(standardMetadata.map(m => {
    const active = metadata[m.key]?.active ?? m.defaultActive
    if (!active) return [m.key, t('notOffered')]
    return [m.key, [
      m.hasGroup && t('category', { title: tabTitle(fieldGroup(metadata, m.key)) }),
      metadata[m.key]?.description && t('customHelp'),
      metadata.completeness?.active && m.hasWeight && scoreLabel(m.key)
    ].filter(Boolean).join(' · ')]
  }))
})

const customScores = computed(() => {
  if (!datasetsMetadata.value?.completeness?.active) return {}
  return Object.fromEntries((datasetsMetadata.value.custom ?? []).filter(c => c.key).map(c => [c.key, scoreLabel(`custom.${c.key}`)]))
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  // a schema default is a fallback read by the code, never stored with the settings
  useDefault: false,
  xI18n: true,
  locale: locale.value,
  context: { metadata: metadataByKey.value, metadataItems: standardMetadataItems, metadataSubtitles: metadataSubtitles.value, customScores: customScores.value, labels: labels.value }
}))

// http://localhost:5600/data-fair/embed/settings/user/superadmin/datasetsMetadata
</script>
