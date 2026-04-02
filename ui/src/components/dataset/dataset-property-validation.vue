<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon
        size="small"
        variant="flat"
        :title="t('validationConfig')"
      >
        <v-icon :icon="mdiCheckDecagram" />
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('validationConfig') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click="dialog = false"
        >
          <v-icon :icon="mdiClose" />
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3">
        <v-form>
          <v-alert
            v-if="isRest"
            type="info"
            variant="tonal"
            class="mb-4"
          >
            {{ t('validationRestMessage') }}
          </v-alert>
          <v-alert
            v-else
            type="info"
            variant="tonal"
            class="mb-4"
          >
            {{ t('validationFileMessage') }}
          </v-alert>

          <v-checkbox
            v-model="property['x-required']"
            :label="t('required')"
            :disabled="!editable"
          />

          <v-checkbox
            v-if="property['x-labels'] && Object.keys(property['x-labels']).length > 0"
            v-model="property['x-labelsRestricted']"
            :label="t('restricted')"
            :disabled="!editable"
          />

          <v-text-field
            v-if="property.type === 'number' || property.type === 'integer'"
            :model-value="property.minimum"
            :label="t('minimum')"
            :disabled="!editable"
            type="number"
            variant="outlined"
            density="compact"
            clearable
            @update:model-value="setNumberProp('minimum', $event)"
          />

          <v-text-field
            v-if="property.type === 'number' || property.type === 'integer'"
            :model-value="property.maximum"
            :label="t('maximum')"
            :disabled="!editable"
            type="number"
            variant="outlined"
            density="compact"
            clearable
            @update:model-value="setNumberProp('maximum', $event)"
          />

          <v-text-field
            v-if="property.type === 'string' && !property.format"
            :model-value="property.minLength"
            :label="t('minLength')"
            :disabled="!editable"
            type="number"
            min="0"
            variant="outlined"
            density="compact"
            clearable
            @update:model-value="setNumberProp('minLength', $event)"
          />

          <v-text-field
            v-if="property.type === 'string' && !property.format"
            :model-value="property.maxLength"
            :label="t('maxLength')"
            :disabled="!editable"
            type="number"
            min="0"
            variant="outlined"
            density="compact"
            clearable
            @update:model-value="setNumberProp('maxLength', $event)"
          />

          <template v-if="property.type === 'string' && !property.format">
            <v-alert
              type="info"
              variant="tonal"
              class="mb-4"
            >
              {{ t('validationRegexpMessage') }}
            </v-alert>
            <v-text-field
              v-model="property.pattern"
              :label="t('pattern')"
              :disabled="!editable"
              variant="outlined"
              density="compact"
              clearable
              :rules="[checkRegexp]"
              hide-details="auto"
              @click:clear="delete property.pattern"
            />
            <v-text-field
              v-if="property.pattern"
              v-model="property.patternErrorMessage"
              :label="t('patternErrorMessage')"
              :disabled="!editable"
              variant="outlined"
              density="compact"
              clearable
              class="mt-2"
              @click:clear="delete property.patternErrorMessage"
            />
          </template>

          <template v-if="property.type === 'string' && property.format === 'date'">
            <v-alert
              type="info"
              variant="tonal"
              class="mb-4"
            >
              {{ t('dateFormatMessage') }}
            </v-alert>
            <v-select
              v-model="property.dateFormat"
              :label="t('dateFormat')"
              :disabled="!editable"
              variant="outlined"
              density="compact"
              clearable
              :items="dateFormats"
              @click:clear="delete property.dateFormat"
            />
          </template>

          <template v-if="property.type === 'string' && property.format === 'date-time'">
            <v-alert
              type="info"
              variant="tonal"
              class="mb-4"
            >
              {{ t('dateTimeFormatMessage') }}
            </v-alert>
            <v-select
              v-model="property.dateTimeFormat"
              :label="t('dateTimeFormat')"
              :disabled="!editable"
              variant="outlined"
              density="compact"
              clearable
              :items="dateTimeFormats"
              @click:clear="delete property.dateTimeFormat"
            />
          </template>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  validationConfig: Configuration de la validation des données
  required: Information obligatoire
  restricted: Cochez cette case pour restreindre les données aux valeurs avec libellés associés
  pattern: Format
  patternErrorMessage: Message d'erreur en cas de format erroné
  minimum: Minimum
  maximum: Maximum
  minLength: Longueur minimale
  maxLength: Longueur maximale
  validationRestMessage: Ces règles de validation seront appliquées dans les formulaires d'édition et vérifiées au moment de la réception de la donnée par la plateforme.
  validationFileMessage: Ces règles de validation seront appliquées lors de l'analyse des nouvelles versions de fichier. Les brouillons ne seront pas automatiquement validés si des erreurs sont détectées.
  validationRegexpMessage: La définition du format est basée sur une expression régulière. Il s'agit d'un paramétrage avancé.
  validationRegexError: expression régulière invalide
  dateFormatMessage: Vous pouvez choisir un format de date accepté. Par défaut le seul format accepté est ISO 8601.
  dateFormat: Formattage de date
  dateTimeFormatMessage: Vous pouvez choisir un format de date et heure accepté. Par défaut le seul format accepté est IS0 8601.
  dateTimeFormat: Formattage de date et heure
en:
  validationConfig: Data validation configuration
  required: required information
  restricted: check this box to restrict data to values with associated labels
  pattern: Format
  patternErrorMessage: Error message in case of format error
  minimum: Minimum
  maximum: Maximum
  minLength: Minimum length
  maxLength: Maximum length
  validationRestMessage: These validation rules will be applied in the edition forms and checked when the data is received by the platform.
  validationFileMessage: These validation rules will be applied when analyzing new file versions. Drafts will not be automatically validated if errors are detected.
  validationRegexpMessage: The format definition is based on a regular expression. This is an advanced setting.
  validationRegexError: invalid regular expression
  dateFormatMessage: You can choose an accepted date format. By default only ISO 8601 is accepted.
  dateFormat: Date format
  dateTimeFormatMessage: You can choose an accepted datetime format. By default only ISO 8601 is accepted.
  dateTimeFormat: Datetime format
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { mdiCheckDecagram, mdiClose } from '@mdi/js'

const { t } = useI18n({ useScope: 'local' })

const props = defineProps<{
  property: any
  editable?: boolean
  isRest?: boolean
}>()

const dialog = ref(false)

const dateFormats = [
  'D/M/YYYY',
  'D/M/YY',
  'YYYY/M/D'
]

const dateTimeFormats = [
  'D/M/YYYY H:m',
  'D/M/YY H:m',
  'D/M/YYYY, H:m',
  'D/M/YY, H:m',
  'D/M/YYYY H:m:s',
  'D/M/YY H:m:s',
  'D/M/YYYY, H:m:s',
  'D/M/YY, H:m:s',
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DD HH:mm:ss'
]

function setNumberProp (prop: string, value: string | number | null) {
  const parsed = parseInt(String(value))
  if (isNaN(parsed)) {
    delete props.property[prop]
  } else {
    props.property[prop] = parsed
  }
}

function checkRegexp (v: string) {
  try {
    RegExp(v)
    return true
  } catch (err) {
    return t('validationRegexError')
  }
}
</script>
