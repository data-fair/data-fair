<template>
  <v-menu
    v-if="editTtl"
    v-model="show"
    :close-on-content-click="false"
    max-width="400"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        icon
        color="warning"
        v-bind="activatorProps"
      >
        <v-icon :icon="mdiPencil" />
      </v-btn>
    </template>
    <v-card>
      <v-alert
        :text="revisions ? t('alertRevisions') : t('alert')"
        type="warning"
        variant="tonal"
        density="compact"
        :icon="false"
        class="mb-0 mt-1"
      />
      <v-card-text>
        <v-checkbox
          v-model="editTtl.active"
          :label="t('activate')"
        />
        <v-select
          v-if="!revisions"
          v-model="editTtl.prop"
          :label="t('col')"
          :items="dateTimeFields"
          item-value="key"
          item-title="title"
        />
        <v-text-field
          v-model.number="editTtl.delay.value"
          variant="outlined"
          density="compact"
          type="number"
          :label="t('days')"
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
          @click="change()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
import { mdiPencil } from '@mdi/js'

const messages = {
  fr: {
    alert: 'Si vous configurez l\'expiration automatique, les lignes supprimées ne pourront pas être récupérées.',
    alertRevisions: 'Si vous configurez l\'expiration automatique des révisions, les informations supprimées ne pourront pas être récupérées.',
    activate: 'activer l\'expiration automatique',
    col: 'colonne de date de référence',
    days: 'nombre de jours avant expiration',
    cancel: 'annuler',
    save: 'enregistrer'
  },
  en: {
    alert: 'If you configure automatic expiration, the deleted lines will not be recoverable.',
    alertRevisions: 'If you configure automatic expiration of revisions, the deleted data will not be recoverable.',
    activate: 'activate automatic expiration',
    col: 'column containing the reference date',
    days: 'number of days before expiration',
    cancel: 'cancel',
    save: 'Save'
  }
}

const props = defineProps<{
  ttl: any
  schema: any[]
  revisions?: boolean
}>()

const emit = defineEmits<{
  change: [value: any]
}>()

const { t } = useI18n({ messages })

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

watch(() => props.ttl, () => {
  editTtl.value = JSON.parse(JSON.stringify(props.ttl))
}, { immediate: true })

function change () {
  editTtl.value.delay.value = editTtl.value.delay.value || 0
  emit('change', editTtl.value)
  show.value = false
}
</script>
