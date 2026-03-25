<template>
  <div v-if="dataset">
    <v-text-field
      v-model="dataset.title"
      :disabled="!can('writeDescription')"
      :label="t('title')"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-3"
    />

    <v-textarea
      v-model="dataset.summary"
      :disabled="!can('writeDescription')"
      :label="t('summary')"
      rows="3"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-3"
    />

    <markdown-editor
      v-model="dataset.description"
      :disabled="!can('writeDescription')"
      :label="t('description')"
      :locale="locale"
      :csp-nonce="$cspNonce"
    />

    <v-text-field
      id="slug-input"
      v-model="dataset.slug"
      :readonly="true"
      :disabled="!can('writeDescriptionBreaking')"
      :label="t('slug')"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-3"
    />

    <v-menu
      v-if="can('writeDescriptionBreaking')"
      v-model="slugMenu"
      activator="#slug-input"
      :close-on-content-click="false"
      max-width="700"
      @update:model-value="val => { if (val) newSlug = dataset.slug }"
    >
      <v-card>
        <v-card-title>
          {{ t('slug') }}
        </v-card-title>
        <v-card-text>
          <v-alert
            type="warning"
            variant="outlined"
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
            @click="slugMenu = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            :disabled="newSlug === dataset.slug || !newSlug || !newSlug.match(slugRegex)"
            @click="dataset.slug = newSlug; slugMenu = false"
          >
            {{ t('validate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>
  </div>
</template>

<i18n lang="yaml">
fr:
  slug: Identifiant de publication
  slugWarning: Cet identifiant unique et lisible est utilise dans les URLs de pages de portails, d'APIs de donnees, etc. Attention, si vous le modifiez vous pouvez casser des liens et des applications existantes. Vous ne pouvez utiliser que des lettres minuscules non accentuees, des chiffres et des tirets.
  newSlug: Nouvel identifiant de publication
  title: Titre
  summary: Resume
  description: Description
  cancel: Annuler
  validate: Valider
en:
  slug: Publication identifier
  slugWarning: "This unique and readable id is used in portal pages URLs, data APIs, etc. Warning: if you modify it you can break existing links and applications."
  newSlug: New publication identifier
  title: Title
  summary: Summary
  description: Description
  cancel: Cancel
  validate: Validate
</i18n>

<script lang="ts" setup>
import { MarkdownEditor } from '@koumoul/vjsf-markdown'

const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()

const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/
const slugMenu = ref(false)
const newSlug = ref('')

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false
</script>
