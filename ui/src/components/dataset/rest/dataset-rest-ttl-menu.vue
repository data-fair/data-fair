<template>
  <v-menu
    v-model="show"
    :close-on-content-click="false"
    max-width="400"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        icon
        variant="text"
        :color="color"
        v-bind="activatorProps"
      >
        <v-icon :icon="mdiPencil" />
      </v-btn>
    </template>
    <v-card>
      <v-alert
        :text="revisions ? t('alertRevisions') : t('alert')"
        :icon="false"
        type="warning"
        variant="tonal"
        density="compact"
      />
      <v-card-text>
        <v-checkbox
          v-model="editTtl.active"
          :label="t('activate')"
          hide-details
        />
        <v-select
          v-if="!revisions"
          v-model="editTtl.prop"
          :label="t('col')"
          :items="dateTimeFields"
          item-value="key"
          item-title="title"
          variant="outlined"
          density="compact"
          class="mb-4"
          hide-details
        />
        <v-text-field
          v-model.number="editTtl.delay.value"
          variant="outlined"
          density="compact"
          type="number"
          :label="t('days')"
          hide-details
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="show = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          @click="change()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  alert: "Si vous configurez l'expiration automatique, les lignes supprimées ne pourront pas être récupérées."
  alertRevisions: "Si vous configurez l'expiration automatique des révisions, les informations supprimées ne pourront pas être récupérées."
  activate: Activer l'expiration automatique
  col: Colonne de date de référence
  days: Nombre de jours avant expiration
  cancel: Annuler
  save: Confirmer
en:
  alert: "If you configure automatic expiration, the deleted lines cannot be recovered."
  alertRevisions: "If you configure automatic expiration of revisions, the deleted data cannot be recovered."
  activate: Activate automatic expiration
  col: Column containing the reference date
  days: Number of days before expiration
  cancel: Cancel
  save: Confirm
</i18n>

<script setup lang="ts">
import { mdiPencil } from '@mdi/js'

const props = withDefaults(defineProps<{
  ttl: any
  schema: any[]
  revisions?: boolean
  color?: string
}>(), {
  color: 'primary'
})

const emit = defineEmits<{
  change: [value: any]
}>()

const { t } = useI18n()

const show = ref(false)
const editTtl = ref<any>(null)

const dateTimeFields = computed(() => {
  return props.schema
    .filter((prop: any) => prop.format === 'date-time')
    .map((field: any) => ({
      key: field.key,
      title: field.title || field['x-originalName'] || field.key
    }))
})

const defaultTtl = () => props.revisions
  ? { active: false, delay: { value: 0 } }
  : { active: false, prop: '', delay: { value: 0 } }

watch(() => props.ttl, () => {
  editTtl.value = props.ttl
    ? JSON.parse(JSON.stringify(props.ttl))
    : defaultTtl()
}, { immediate: true })

function change () {
  editTtl.value.delay.value = editTtl.value.delay.value || 0
  const result = { ...editTtl.value }
  if (props.revisions) delete result.prop
  emit('change', result)
  show.value = false
}
</script>
