<template>
  <div>
    <v-btn
      v-if="canEdit"
      color="primary"
      variant="flat"
      class="mb-4"
      :prepend-icon="mdiPencil"
      @click="open"
    >
      {{ t('editSlug') }}
    </v-btn>

    <v-dialog
      v-model="showDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title>{{ t('editSlug') }}</v-card-title>
        <v-card-text>
          <v-alert
            type="warning"
            variant="outlined"
            class="mb-4"
          >
            {{ t('slugWarning') }}
          </v-alert>
          <v-text-field
            v-model="newSlug"
            :label="t('newSlug')"
            autofocus
            variant="outlined"
            density="compact"
            hide-details
            :rules="[val => !!val, val => !!val?.match(slugRegex)]"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            variant="flat"
            :disabled="newSlug === slug || !newSlug || !newSlug.match(slugRegex)"
            @click="confirmSlug"
          >
            {{ t('validate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<i18n lang="yaml">
fr:
  editSlug: Modifier l'identifiant de publication
  slugWarning: Cet identifiant unique et lisible est utilisé dans les URLs de pages de portails, d'APIs de données, etc. Attention, si vous le modifiez vous pouvez casser des liens et des applications existantes. Vous ne pouvez utiliser que des lettres minuscules non accentuées, des chiffres et des tirets.
  newSlug: Nouvel identifiant de publication
  cancel: Annuler
  validate: Valider
en:
  editSlug: Edit publication identifier
  slugWarning: "This unique and readable id is used in portal pages URLs, data APIs, etc. Warning: if you modify it you can break existing links and applications. You can only use lowercase unaccented letters, digits and hyphens."
  newSlug: New publication identifier
  cancel: Cancel
  validate: Validate
</i18n>

<script setup lang="ts">
import { mdiPencil } from '@mdi/js'

const props = defineProps<{
  slug: string
  canEdit: boolean
}>()

const emit = defineEmits<{
  (e: 'update:slug', value: string): void
}>()

const { t } = useI18n()

const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/
const showDialog = ref(false)
const newSlug = ref('')

const open = () => {
  newSlug.value = props.slug
  showDialog.value = true
}

const confirmSlug = () => {
  showDialog.value = false
  emit('update:slug', newSlug.value)
}
</script>
