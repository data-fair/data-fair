<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        :color="hasTransform ? 'success' : undefined"
        :title="t('transform')"
        :icon="mdiDatabaseCog"
        size="text"
        variant="flat"
      />
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('transform') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click="dialog = false"
        >
          <v-icon :icon="mdiClose" />
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3">
        <df-tutorial-alert
          id="transform-type"
          persistent
          :initial="true"
          class="mb-2"
        >
          <p>{{ t('typeOverrideHelp1') }}</p>
          <p class="mb-0">
            {{ t('typeOverrideHelp2') }}
          </p>
        </df-tutorial-alert>

        <v-select
          v-model="overwritePropertyType"
          :items="rawPropertyTypes"
          :item-title="(item: any) => item.title"
          :item-value="(item: any) => `${item.type}${item.format || item['x-display'] || ''}`"
          return-object
          :label="t('overrideType')"
          variant="outlined"
          density="compact"
          persistent-placeholder
          clearable
          :placeholder="t('detectedType') + ': ' + (detectedPropertyType?.title?.toLowerCase() || '')"
          :disabled="!editable"
        />

        <df-tutorial-alert
          id="expr-eval-transform"
          persistent
          :initial="true"
        >
          <i18n-t
            keypath="exprEvalHelp"
            tag="p"
          >
            <template #link>
              <a
                href="https://github.com/silentmatt/expr-eval"
                target="_blank"
              >expr-eval</a>
            </template>
          </i18n-t>
          <dataset-expr-eval-doc :exclude="['SUM', 'AVERAGE']" />
        </df-tutorial-alert>

        <v-text-field
          v-model="property['x-transform'].expr"
          class="mt-2"
          :label="t('expr')"
          variant="outlined"
          density="compact"
          :disabled="!editable"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  transform: Transformation
  overrideType: Surcharger le type
  detectedType: "type détecté"
  expr: Expression
  typeOverrideHelp1: Vous pouvez surcharger le type de cette colonne. De cette manière vous pouvez définir un type différent de celui détecté automatiquement depuis l'analyse du fichier.
  typeOverrideHelp2: Si le type choisi ne peut pas être obtenu à partir des données brutes vous pouvez saisir une expression de transformation ci-dessous.
  exprEvalHelp: 'Appliquez une transformation aux données de cette colonne quand elles sont chargées. Une expression (ou formule) est utilisée pour transformer chaque valeur. Elle doit suivre la syntaxe du module {link}. La valeur à transformer est passée en paramètre avec le nom "value".'
en:
  transform: Transformation
  overrideType: Override type
  detectedType: "detected type"
  expr: Expression
  typeOverrideHelp1: You can override the type of this column. This way you can define a type different from the one automatically detected from the file analysis.
  typeOverrideHelp2: If the chosen type cannot be obtained from the raw data you can enter a transformation expression below.
  exprEvalHelp: 'Apply a transformation to the data in this column when it is loaded. An expression (or formula) is used to transform each value. It must follow the syntax of the {link} module. The value to transform is passed as a parameter with the name "value".'
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { mdiClose, mdiDatabaseCog } from '@mdi/js'
import { propertyTypes } from '~/utils/dataset'

const { t } = useI18n()

const props = defineProps<{
  property: any
  editable?: boolean
}>()

const dialog = ref(false)

const rawPropertyTypes = propertyTypes.filter(p => !('x-display' in p))

const hasTransform = computed(() => {
  const transform = props.property['x-transform']
  return !!(transform?.expr?.trim() || transform?.type)
})

const detectedPropertyType = computed(() => {
  return rawPropertyTypes.find(
    p => p.type === props.property.type && (p.format || null) === (props.property.format || null)
  )
})

const overwritePropertyType = computed({
  get () {
    if (!props.property['x-transform']?.type) return null
    return rawPropertyTypes.find(
      p => p.type === props.property['x-transform'].type &&
           (p.format || null) === (props.property['x-transform'].format || null)
    ) || null
  },
  set (propertyType: any) {
    if (!propertyType) {
      delete props.property['x-transform'].type
      delete props.property['x-transform'].format
    } else {
      props.property['x-transform'].type = propertyType.type
      if (propertyType.format) {
        props.property['x-transform'].format = propertyType.format
      } else {
        delete props.property['x-transform'].format
      }
    }
  }
})

watch(dialog, (show) => {
  if (show) {
    if (!props.property['x-transform']) {
      props.property['x-transform'] = {}
    }
    if (!props.property['x-transform'].expr) {
      props.property['x-transform'].expr = ''
    }
  } else {
    if (props.property['x-transform'] && !props.property['x-transform'].expr && !props.property['x-transform'].type) {
      delete props.property['x-transform']
    }
  }
})
</script>
