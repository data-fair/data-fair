<template>
  <v-dialog
    :model-value="!!confirmation"
    max-width="600"
    @update:model-value="confirmation = null"
  >
    <v-card
      v-if="confirmation"
      :title="t('confirmSaveTitle')"
    >
      <v-card-text>
        <v-alert
          type="warning"
          variant="outlined"
          :title="t('risksTitle')"
        >
          <p class="mb-2">
            {{ t('risksText') }}
          </p>
          <ul class="pl-6">
            <li
              v-for="warning of confirmation.warnings"
              :key="warning"
            >
              {{ warning }}
            </li>
          </ul>
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="confirmation = null"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :loading="confirmation.edit.save.loading"
          @click="confirmSave()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import type { Settings } from '#api/types'

// a save that would remove values from datasets or applications asks for confirmation first
type Edit = { save: { execute: () => Promise<unknown>, loading: Readonly<Ref<boolean>> } }

const { account, previous, current } = defineProps<{
  account: { type: string, id: string }
  previous?: Settings | null
  current?: Settings | null
}>()

const { t } = useI18n()

const confirmation = ref<{ warnings: string[], edit: Edit } | null>(null)

// topics and custom metadata are org-level settings, the API propagates them to every department
const fetchUsage = async (resource: 'datasets' | 'applications', facet: string) => {
  const owner = `${account.type}:${account.id}`
  const res = await $fetch<{ facets: Record<string, { value: any, count: number }[]> }>(`/${resource}`, { query: { size: 0, facets: facet, owner } })
  return res.facets[facet] ?? []
}
const usageText = (datasets = 0, applications = 0) => [
  datasets && t('datasetsCount', { n: datasets }, datasets),
  applications && t('applicationsCount', { n: applications }, applications)
].filter(Boolean).join(t('and'))

const customMetadataRisks = async () => {
  const newCustom = current?.datasetsMetadata?.custom ?? []
  const changes = (previous?.datasetsMetadata?.custom ?? []).flatMap(oldMeta => {
    const newMeta = newCustom.find(c => c.key === oldMeta.key)
    if (!newMeta) return [{ meta: oldMeta, message: 'customDeleted' }]
    // same rule as the API: a new type or multiple flag empties the stored values
    if ((newMeta.type ?? 'string') !== (oldMeta.type ?? 'string') || !!newMeta.multiple !== !!oldMeta.multiple) return [{ meta: oldMeta, message: 'customTypeChanged' }]
    if (newMeta.enum?.length && JSON.stringify(newMeta.enum) !== JSON.stringify(oldMeta.enum)) return [{ meta: newMeta, message: 'customValueRemoved' }]
    return []
  })
  if (!changes.length) return []
  const usage = await fetchUsage('datasets', 'customMetadata')
  const warnings = await Promise.all(changes.map(async ({ meta, message }) => {
    if (message !== 'customValueRemoved') {
      const count = usage.find(u => u.value === meta.key)?.count
      return count ? [t(message, { title: meta.title, usage: usageText(count) })] : []
    }
    // same rule as the API: values no longer in the list are removed
    const values = await fetchUsage('datasets', `custom-${meta.key}`)
    return values.filter(v => !meta.enum!.includes(v.value)).map(v => t(message, { value: v.value, title: meta.title, usage: usageText(v.count) }))
  }))
  return warnings.flat()
}

const topicsRisks = async () => {
  const removed = (previous?.topics ?? []).filter(o => !current?.topics?.some(n => n.id === o.id))
  if (!removed.length) return []
  const [datasetsUsage, applicationsUsage] = await Promise.all([
    fetchUsage('datasets', 'topics'),
    $uiConfig.disableApplications ? [] : fetchUsage('applications', 'topics')
  ])
  return removed.flatMap(topic => {
    const count = (usage: { value: any, count: number }[]) => usage.find(u => u.value?.id === topic.id)?.count
    const text = usageText(count(datasetsUsage), count(applicationsUsage))
    return text ? [t('topicDeleted', { title: topic.title, usage: text })] : []
  })
}

const risks = { topics: topicsRisks, customMetadata: customMetadataRisks }
const save = useAsyncAction(async (edit: Edit, kind: keyof typeof risks) => {
  const warnings = await risks[kind]()
  if (warnings.length) confirmation.value = { warnings, edit }
  else await edit.save.execute()
})

async function confirmSave () {
  await confirmation.value!.edit.save.execute()
  confirmation.value = null
}

defineExpose({ save: save.execute, loading: save.loading })
</script>

<i18n lang="yaml">
fr:
  save: Enregistrer
  cancel: Annuler
  confirmSaveTitle: Confirmer l'enregistrement
  datasetsCount: "{n} jeu de données | {n} jeu de données | {n} jeux de données"
  applicationsCount: "{n} visualisation | {n} visualisation | {n} visualisations"
  and: " et "
  risksTitle: Des valeurs vont être retirées
  risksText: "Ces modifications s'appliquent aussi au contenu existant et ne pourront pas être annulées :"
  customDeleted: "Métadonnée « {title} » supprimée : elle sera retirée de {usage}."
  customTypeChanged: "Métadonnée « {title} » changée de type : ses valeurs seront vidées dans {usage}."
  customValueRemoved: "Valeur « {value} » retirée de la liste « {title} » : elle sera retirée de {usage}."
  topicDeleted: "Thématique « {title} » supprimée : elle sera retirée de {usage}."
en:
  save: Save
  cancel: Cancel
  confirmSaveTitle: Confirm the save
  datasetsCount: "{n} dataset | {n} dataset | {n} datasets"
  applicationsCount: "{n} application | {n} application | {n} applications"
  and: " and "
  risksTitle: Values will be removed
  risksText: "These changes also apply to the existing content and cannot be undone:"
  customDeleted: "Metadata \"{title}\" deleted: it will be removed from {usage}."
  customTypeChanged: "Metadata \"{title}\" type changed: its values will be emptied in {usage}."
  customValueRemoved: "Value \"{value}\" removed from the \"{title}\" list: it will be removed from {usage}."
  topicDeleted: "Topic \"{title}\" deleted: it will be removed from {usage}."
</i18n>
