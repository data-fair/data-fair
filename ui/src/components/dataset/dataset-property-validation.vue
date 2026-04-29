<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        :title="t('validationConfig')"
        :icon="mdiCheckDecagram"
        variant="text"
        size="small"
      />
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        :title="t('validationConfig')"
        density="compact"
        flat
      >
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="dialog = false"
        />
      </v-toolbar>

      <v-card-text>
        <v-form>
          <df-tutorial-alert
            v-if="isRest"
            id="validation-rest"
            :text="t('validationRestMessage')"
            persistent
          />
          <df-tutorial-alert
            v-else
            id="validation-file"
            :text="t('validationFileMessage')"
            persistent
          />

          <v-checkbox
            v-model="property['x-required']"
            :label="t('required')"
            :disabled="!editable"
            density="comfortable"
            hide-details
          />

          <v-checkbox
            v-if="property['x-labels'] && Object.keys(property['x-labels']).length > 0"
            v-model="property['x-labelsRestricted']"
            :label="t('restricted')"
            :disabled="!editable"
            density="comfortable"
            hide-details
          />

          <v-text-field
            v-if="property.type === 'number' || property.type === 'integer'"
            :model-value="property.minimum"
            :label="t('minimum')"
            :disabled="!editable"
            type="number"
            variant="outlined"
            density="compact"
            class="mt-2"
            hide-details
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
            class="mt-2"
            hide-details
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
            class="mt-2"
            hide-details
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
            class="mt-2"
            hide-details
            clearable
            @update:model-value="setNumberProp('maxLength', $event)"
          />

          <template v-if="property.type === 'string' && !property.format">
            <df-tutorial-alert
              id="validation-regexp"
              :text="t('validationRegexpMessage')"
              class="mb-2"
              persistent
            />
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
            <df-tutorial-alert
              id="validation-date-format"
              :text="t('dateFormatMessage')"
              class="mb-2"
              persistent
            />
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
            <df-tutorial-alert
              id="validation-date-time-format"
              :text="t('dateTimeFormatMessage')"
              class="mb-2"
              persistent
            />
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

          <v-select
            v-if="property['x-refersTo'] && availableMasters[property['x-refersTo']]"
            :model-value="property['x-master']"
            :label="t('masterData')"
            :disabled="!editable"
            :items="availableMasters[property['x-refersTo']]"
            item-title="title"
            item-value="id"
            return-object
            variant="outlined"
            density="compact"
            class="mt-2"
            clearable
            hide-details
            @update:model-value="setMasterData"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  validationConfig: Validation des données
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
  dateFormat: Formatage de date
  dateTimeFormatMessage: Vous pouvez choisir un format de date et heure accepté. Par défaut le seul format accepté est IS0 8601.
  dateTimeFormat: Formatage de date et heure
  masterData: Valeurs issues d'une donnée de référence
en:
  validationConfig: Data validation
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
  masterData: Values coming from a master-data dataset
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { mdiCheckDecagram, mdiClose } from '@mdi/js'
import { useDatasetStore } from '~/composables/dataset/dataset-store'
import { useRemoteServices } from '~/composables/use-remote-services'

const { t } = useI18n()

const props = defineProps<{
  property: any
  editable?: boolean
  isRest?: boolean
}>()

const dialog = ref(false)

const { dataset } = useDatasetStore()
const owner = computed(() => dataset.value?.owner)
const { remoteServices } = useRemoteServices(owner)

type MasterDataItem = {
  id: string
  title: string
  remoteService: string
  action: string
  'x-fromUrl': string
  'x-itemKey': string
  'x-itemTitle'?: string
}

const labelConcept = 'http://www.w3.org/2000/01/rdf-schema#label'

const availableMasters = computed(() => {
  const masters: Record<string, MasterDataItem[]> = {}
  for (const service of remoteServices.value as any[]) {
    for (const action of service.actions ?? []) {
      if (action.inputCollection) continue
      if (action.type !== 'http://schema.org/SearchAction') continue
      const nonLabelOutputs = (action.output ?? []).filter((o: any) => o.concept && o.concept !== labelConcept)
      if (nonLabelOutputs.length !== 1) continue
      const keyOutput = nonLabelOutputs[0]
      const labelOutput = (action.output ?? []).find((o: any) => o.concept === labelConcept)
      const master: MasterDataItem = {
        id: `${service.id}--${action.id}`,
        title: action.summary,
        remoteService: service.id,
        action: action.id,
        'x-fromUrl': `${service.server}${action.operation.path}?q={q}`,
        'x-itemKey': keyOutput.name,
        'x-itemTitle': labelOutput?.name
      }
      const concept = keyOutput.concept
      masters[concept] = masters[concept] ?? []
      masters[concept].push(master)
    }
  }
  return masters
})

function setMasterData (masterData: MasterDataItem | null) {
  if (!masterData) {
    delete props.property['x-master']
    delete props.property['x-fromUrl']
    delete props.property['x-itemKey']
    delete props.property['x-itemTitle']
    delete props.property['x-itemsProp']
  } else {
    props.property['x-master'] = {
      id: masterData.id,
      title: masterData.title,
      remoteService: masterData.remoteService,
      action: masterData.action
    }
    props.property['x-fromUrl'] = masterData['x-fromUrl']
    props.property['x-itemKey'] = masterData['x-itemKey']
    if (masterData['x-itemTitle']) props.property['x-itemTitle'] = masterData['x-itemTitle']
    props.property['x-itemsProp'] = 'results'
  }
}

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
