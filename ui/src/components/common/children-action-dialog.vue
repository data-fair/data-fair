<template>
  <v-dialog
    v-model="show"
    max-width="500"
  >
    <v-card
      :title="title"
      :loading="loading ? 'warning' : undefined"
    >
      <v-card-text class="pb-0">
        {{ message }}
        <template v-if="warning">
          <v-alert
            type="warning"
            variant="outlined"
            density="compact"
            class="mt-4"
          >
            {{ warning }}
          </v-alert>
          <v-radio-group
            v-model="action"
            class="mt-2"
            hide-details
          >
            <v-radio
              :label="t(kind === 'datasets' ? 'childrenActionUnflagDatasets' : 'childrenActionUnflagResources')"
              value="unflag"
            />
            <v-radio
              :label="t(kind === 'datasets' ? 'childrenActionDeleteDatasets' : 'childrenActionDeleteResources')"
              value="delete"
            />
          </v-radio-group>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :disabled="loading"
          @click="show = false"
        >
          {{ cancelLabel ?? t('no') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :loading="loading"
          @click="emit('confirm', warning ? action : undefined)"
        >
          {{ confirmLabel ?? t('yes') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  childrenActionUnflagDatasets: Conserver les jeux enfants en leur retirant l'attribut enfant
  childrenActionDeleteDatasets: Supprimer aussi les jeux enfants
  childrenActionUnflagResources: Conserver les ressources enfants en leur retirant l'attribut enfant
  childrenActionDeleteResources: Supprimer aussi les ressources enfants
  no: Non
  yes: Oui
en:
  childrenActionUnflagDatasets: Keep the child datasets and remove their child attribute
  childrenActionDeleteDatasets: Also delete the child datasets
  childrenActionUnflagResources: Keep the child resources and remove their child attribute
  childrenActionDeleteResources: Also delete the child resources
  no: "No"
  yes: "Yes"
</i18n>

<script setup lang="ts">
defineProps<{
  title: string
  message: string
  // alert shown above the delete-vs-unflag choice; when absent the dialog is a plain confirmation
  warning?: string
  // which radio label variants to use: children of a virtual dataset are datasets, children of an
  // application are resources (datasets and/or applications)
  kind: 'datasets' | 'resources'
  loading?: boolean
  cancelLabel?: string
  confirmLabel?: string
}>()

const emit = defineEmits<{
  confirm: [action?: 'delete' | 'unflag']
}>()

const { t } = useI18n()

const show = defineModel<boolean>({ default: false })

const action = ref<'delete' | 'unflag'>('unflag')
watch(show, (visible) => { if (visible) action.value = 'unflag' })
</script>
