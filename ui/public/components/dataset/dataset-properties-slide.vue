<template>
  <v-sheet
    class="properties-slide"
    color="transparent"
  >
    <v-row class="ma-0">
      <draggable
        :value="propertiesRefs"
        :disabled="!sortable"
        ghost-class="property-ghost"
        @input="sorted => $emit('sort', sorted)"
      >
        <!-- ripple is buggy with draggable -->
        <v-btn
          v-for="({prop, originalProp, warning}, i) in propertiesRefs"
          :key="prop.key"
          style="text-transform: none;"
          class="ma-0 px-2"
          :class="{'font-weight-black': !!prop['x-refersTo']}"
          v-bind="btnProps(prop, originalProp, warning, i, currentProperty === i)"
          :ripple="!sortable"
          @click="switchProperty(i)"
        >
          <v-icon
            small
            style="margin-right:4px;"
            v-text="propTypeIcon(prop)"
          />
          {{ prop.title || prop['x-originalName'] || prop.key }}
        </v-btn>
      </draggable>
    </v-row>
    <v-row
      v-if="currentProperty == null"
      class="ma-0"
    >
      <v-subheader v-t="'detailedInfo'" />
    </v-row>
    <v-sheet
      v-if="currentProperty != null"
      color="transparent"
    >
      <v-row v-if="currentPropRef.warning">
        <v-col class="mt-4 pa-0">
          <v-alert
            type="warning"
            dense
            outlined
            class="mb-0"
          >
            {{ currentPropRef.warning }}
          </v-alert>
        </v-col>
      </v-row>
      <v-row class="pt-2">
        <v-col
          cols="12"
          md="6"
          lg="5"
          order-md="2"
        >
          <v-row
            v-if="editable && currentPropRef.editable && !dataset.isVirtual"
            class="ma-0"
          >
            <v-spacer />
            <div class="mx-1">
              <confirm-menu
                v-if="editable && !noBreakingChanges && currentPropRef.editable && dataset.isRest"
                :property="currentPropRef.prop"
                :btn-props="{fab: true, small: true, depressed: true, dark: true, color: 'admin'}"
                :title="$t('deletePropertyTitle')"
                :text="$t('deletePropertyText')"
                :tooltip="$t('deletePropertyTitle')"
                yes-color="warning"
                alert="error"
                @confirm="$emit('remove', currentPropRef.prop); currentProperty = null"
              />
            </div>
            <div class="mx-1">
              <dataset-property-capabilities
                :property="currentPropRef.prop"
                :editable="editable && !noBreakingChanges && currentPropRef.editable && !dataset.isVirtual"
              />
            </div>
            <div
              v-if="dataset.file && !currentPropRef.prop['x-calculated'] && !currentPropRef.prop['x-extension']"
              class="mx-1"
            >
              <dataset-property-transform
                :property="currentPropRef.prop"
                :editable="editable && !noBreakingChanges && currentPropRef.editable"
              />
            </div>
            <div
              v-if="!currentPropRef.prop['x-calculated'] && !currentPropRef.prop['x-extension']"
              class="mx-1"
            >
              <dataset-property-validation
                :property="currentPropRef.prop"
                :editable="editable && !noBreakingChanges && currentPropRef.editable && !dataset.isVirtual"
              />
            </div>
            <div
              v-if="(currentPropRef.prop.type === 'string' && (!currentPropRef.prop.format || currentPropRef.prop.format === 'uri-reference') || currentPropRef.prop.type === 'boolean')"
              class="mx-1"
            >
              <dataset-property-labels
                :property="currentPropRef.prop"
                :editable="editable && currentPropRef.editable && !dataset.isVirtual"
                :is-rest="dataset.isRest"
              />
            </div>
          </v-row>
          <v-list
            dense
            class="labels-list mt-1"
          >
            <v-list-item
              v-if="currentPropRef.prop['x-extension'] && extensions[currentPropRef.prop['x-extension']]"
              class="font-weight-bold"
            >
              <span :class="labelClass">{{ $t('extension') }}</span>&nbsp;
              {{ extensions[currentPropRef.prop['x-extension']].title }}
            </v-list-item>
            <v-list-item>
              <span :class="labelClass">{{ $t('key') }}</span>&nbsp;
              {{ currentPropRef.prop.key }}
            </v-list-item>
            <v-list-item>
              <span :class="labelClass">Type :</span>&nbsp;
              {{ propTypeTitle(currentPropRef.prop) }}
              <template v-if="currentFileProp && currentFileProp.dateFormat">
                ({{ currentFileProp.dateFormat }})
              </template>
              <template v-if="currentFileProp && currentFileProp.dateTimeFormat">
                ({{ currentFileProp.dateTimeFormat }})
              </template>
            </v-list-item>
            <v-list-item v-if="currentPropRef.prop['x-cardinality']">
              <span :class="labelClass">{{ $t('distinctValues') }} : </span>&nbsp;
              {{ currentPropRef.prop['x-cardinality'].toLocaleString() }}
              <help-tooltip>{{ $t('distinctValuesHelp') }}</help-tooltip>
            </v-list-item>
            <v-list-item v-if="currentPropRef.prop.enum">
              <span :class="labelClass">{{ $t('values') }}</span>&nbsp;
              {{ currentPropRef.prop.enum.join(' - ') | truncate(100) }}
            </v-list-item>
          </v-list>
          <template v-if="currentPropRef.prop.type === 'string' && currentFileProp && currentFileProp.dateTimeFormat">
            <lazy-time-zone-select
              v-model="currentPropRef.prop.timeZone"
              :disabled="!editable || noBreakingChanges || !currentPropRef.editable || dataset.isVirtual"
            />
          </template>
          <v-autocomplete
            v-model="currentPropRef.prop['x-refersTo']"
            :items="vocabularyItems.filter(item => filterVocabulary(item))"
            :disabled="!editable || noBreakingChanges || !currentPropRef.editable || dataset.isVirtual"
            :label="$t('concept')"
            :clearable="true"
            hide-details
            class="mb-3"
          >
            <template #item="data">
              <template v-if="typeof data.item !== 'object'">
                <v-list-item-content>{{ data.item }}</v-list-item-content>
              </template>
              <template v-else>
                <v-list-item-content>
                  <v-list-item-title>{{ data.item.text }}</v-list-item-title>
                  <v-list-item-subtitle>{{ data.item.description }}</v-list-item-subtitle>
                </v-list-item-content>
              </template>
            </template>
            <template #append-outer>
              <help-tooltip>{{ (currentPropRef.prop['x-refersTo'] && vocabulary[currentPropRef.prop['x-refersTo']] && vocabulary[currentPropRef.prop['x-refersTo']].description) || $t('conceptHelp') }}</help-tooltip>
            </template>
          </v-autocomplete>
          <v-select
            v-if="currentPropRef.prop.type === 'string'"
            v-model="currentPropRef.prop.separator"
            :items="[', ', '; ', ' - ', ' / ', ' | ']"
            :disabled="!editable || noBreakingChanges || !currentPropRef.editable || dataset.isVirtual"
            :label="$t('sep')"
            hide-details
            class="mb-3"
            clearable
          >
            <template #append-outer>
              <help-tooltip>{{ $t('separatorHelp') }}</help-tooltip>
            </template>
          </v-select>
          <v-checkbox
            v-if="dataset.isRest && !currentPropRef.prop['x-extension']"
            v-model="currentPropRef.prop.readOnly"
            :disabled="!editable || noBreakingChanges || !currentPropRef.editable"
            :label="$t('readOnly')"
            hide-details
            dense
          >
            <template #append>
              <help-tooltip>{{ $t('readOnlyHelp') }}</help-tooltip>
            </template>
          </v-checkbox>
          <v-select
            v-if="currentPropRef.prop.type === 'string' && !currentPropRef.prop.format && currentPropRef.prop['x-refersTo'] !== 'http://schema.org/description' && currentPropRef.prop['x-refersTo'] !== 'http://schema.org/DigitalDocument'"
            v-model="xDisplay"
            :items="[{value: 'singleline', text: $t('singleline')}, {value: 'textarea', text: $t('textarea')}, {value: 'markdown', text: $t('markdown')}]"
            :label="$t('xDisplay')"
            :disabled="!editable || noBreakingChanges || !currentPropRef.editable"
            hide-details
          >
            <template #append-outer>
              <help-tooltip>{{ $t('xDisplayHelp') }}</help-tooltip>
            </template>
          </v-select>
          <v-checkbox
            v-if="dataset.isRest && !currentPropRef.prop['x-extension'] && currentPropRef.prop['x-refersTo'] === 'http://schema.org/DigitalDocument'"
            :input-value="currentPropRef.prop['x-display'] === 'text-field'"
            :disabled="!editable || !currentPropRef.editable"
            :label="$t('attachmentTextField')"
            hide-details
            dense
            @change="v => {if (currentPropRef.prop['x-display'] === 'text-field') { $delete(currentPropRef.prop, 'x-display')} else { $set(currentPropRef.prop, 'x-display', 'text-field')}}"
          >
            <template #append>
              <help-tooltip>{{ $t('attachmentTextFieldHelp') }}</help-tooltip>
            </template>
          </v-checkbox>

          <v-text-field
            v-if="dataset.isRest && !currentPropRef.prop['x-extension'] && currentPropRef.prop.type === 'string' && !currentPropRef.prop.format"
            v-model.number="maxLength"
            :disabled="!editable || noBreakingChanges || !currentPropRef.editable"
            :label="$t('maxLength')"
            hide-details
            type="number"
          >
            <!--<template #append-outer>
              <help-tooltip>{{ $t('maxLengthHelp') }}</help-tooltip>
            </template>-->
          </v-text-field>
          <v-select
            v-if="currentPropRef.prop['x-refersTo'] && availableMasters[currentPropRef.prop['x-refersTo']]"
            :disabled="!editable || noBreakingChanges || !currentPropRef.editable"
            item-value="id"
            item-text="title"
            :items="availableMasters[currentPropRef.prop['x-refersTo']]"
            :value="currentPropRef.prop['x-master']"
            :label="$t('masterData')"
            :clearable="true"
            :return-object="true"
            dense
            hide-details
            @input="setMasterData"
          />
        </v-col>
        <v-col
          cols="12"
          md="6"
          lg="7"
          order-md="1"
        >
          <v-text-field
            v-model="currentPropRef.prop.title"
            :placeholder="currentPropRef.prop['x-originalName'] || ' '"
            :label="$t('label')"
            :disabled="!editable"
            outlined
            dense
            hide-details
            class="mb-3"
            autofocus
          >
            <template #append-outer>
              <help-tooltip>{{ $t('labelHelp') }}</help-tooltip>
            </template>
          </v-text-field>
          <markdown-editor
            v-model="currentPropRef.prop.description"
            :label="$t('description')"
            :disabled="!editable"
            :easymde-config="{minHeight: '150px'}"
          >
            <template #append>
              <help-tooltip>{{ $t('descriptionHelp') }}</help-tooltip>
            </template>
          </markdown-editor>
          <v-combobox
            :value="currentPropRef.prop['x-group']"
            :disabled="!editable || !currentPropRef.editable"
            :items="groups"
            :label="$t('group')"
            persistent-hint
            :hint="$t('groupHelp')"
            dense
            outlined
            hide-details
            class="mb-3"
            clearable
            hide-selected
            @update:search-input="setGroup"
          >
            <template #append-outer>
              <help-tooltip>{{ $t('groupHelp') }}</help-tooltip>
            </template>
          </v-combobox>
        </v-col>
      </v-row>
    </v-sheet>
  </v-sheet>
</template>

<i18n lang="yaml">
fr:
  detailedInfo: Cliquez sur un nom de colonne pour afficher ses informations détaillées.
  extension: "Extension : "
  key: "Clé dans la source : "
  label: Libellé
  labelHelp: Libellé court de la colonne utilisé dans toutes les applications de données, la clé sera utilisée si vous laissez cette information vide.
  description: Description
  descriptionHelp: Un contenu markdown ou HTML qui sera utilisé pour décrire cette colonne aux utilisateurs des applications de données et de la documentations d'API.
  distinctValues: Nombre de valeurs distinctes
  distinctValuesHelp: approximatif dans le cas de données volumineuses
  values: "Valeurs : "
  sep: Séparateur
  separatorHelp: Ne renseigner que pour les colonnes multivaluées. Ce caractère sera utilisé pour séparer les valeurs.
  concept: Concept
  conceptHelp: Les concepts des colonnes améliorent le traitement de la donnée et sa application.
  xDisplay: Format
  xDisplayHelp: Si vous choisissez "texte formatté" la colonne pourra contenir du markdown ou du HTML simple et les applications en tiendront compte.
  "singleline": "texte"
  "textarea": "texte long"
  "markdown": "texte formatté"
  group: Groupe
  groupHelp: Les groupes aident à la sélection de colonnes. Particulièrement utile quand il y a de nombreuses colonnes.
  ignoreIntegerDetection: Traiter comme un nombre flottant
  ignoreIntegerDetectionHelp: Si vous cochez cette case la détection du type "nombre entier" sera désactivée et le nombre sera traité comme un nombre flottant. Cette étape peut être nécessaire pour rendre compatibles des jeux de données avant de les joindre dans un jeu virtuel.
  readOnly: Lecture seule
  readOnlyHelp: Si vous cochez cette case la colonne sera affichée en lecture seule dans le formulaire de saisie.
  masterData: Valeurs issues d'une donnée de référence
  deletePropertyTitle: Supprimer la colonne
  deletePropertyText: Souhaitez vous supprimer cette colonne ? Attention la donnée sera effacée et définitivement perdue !
  maxLength: Nombre maximum de caractères
  attachmentTextField: Saisie libre d'URL
  attachmentTextFieldHelp: Si vous cochez cette case, l'utilisateur pourra saisir librement une URL vers un fichier, sinon l'utilisateur pourra charger un fichier.
en:
  detailedInfo: Click on a column title to display its detailed information.
  extension: "Extension: "
  key: "Key in the source: "
  label: Label
  labelHelp: Short label of the column used in all data applications, the key will be used if you leave this empty.
  description: Description
  descriptionHelp: A markdown or HTML content that will be used to describe this column to the users of data applications and API documentations.
  distinctValues: Number of distinct values
  distinctValuesHelp: approximative in the case of a large dataset
  values: "Values: "
  sep: Separator
  separatorHelp: Only provide for multi-values columns. This character will be used to separate the values.
  concept: Concept
  conceptHelp: The concepts improve data processing and application.
  xDisplay: Format
  xDisplayHelp: If you chose "formatted text" the column will be able to contain markdown or HTML content that will be displayed as such by applications.
  "singleline": "text"
  "textarea": "long text"
  "markdown": "formatted text"
  group: Group
  groupHelp: Groups help selecting columns. Particularly useful whan there are many columns.
  ignoreIntegerDetection: Handle as a floating number
  ignoreIntegerDetectionHelp: If you check this box the detection of the type integer will be disabled and column will be processed as a floating number. This step might be necessary to make datasets compatibles before joining them in a virtual dataset.
  readOnly: Read only
  readOnlyHelp: If you check this box the column will be rendered as a read only field in the input form.
  masterData: Values coming from a master-data dataset
  deletePropertyTitle: Delete the column
  deletePropertyText: Do you want to delete this column ? Warning, data will be definitively erased !
  maxLength: Max number of characters
  attachmentTextField: Free input URL
  attachmentTextFieldHelp: If you check this box, the user will be able to provide a URL to an external file, otherwise the file will be uploaded to the server.
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import datasetSchema from '../../../../api/types/dataset/schema'
const Draggable = require('vuedraggable')

export default {
  components: { Draggable },
  props: ['propertiesRefs', 'editable', 'sortable', 'noBreakingChanges'],
  data () {
    return {
      datasetSchema,
      currentProperty: null
    }
  },
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['vocabulary', 'vocabularyArray', 'vocabularyItems']),
    ...mapState('dataset', ['dataset', 'remoteServices']),
    ...mapGetters(['propTypeTitle', 'propTypeIcon']),
    ...mapGetters('dataset', ['remoteServicesMap', 'availableMasters']),
    labelClass () {
      return `theme--${this.$vuetify.theme.dark ? 'dark' : 'light'} v-label`
    },
    currentPropRef () {
      return this.currentProperty !== null && this.propertiesRefs[this.currentProperty]
    },
    currentFileProp () {
      return this.dataset.file &&
          this.dataset.file.schema &&
          this.currentPropRef &&
          this.currentPropRef.prop &&
          this.dataset.file.schema.find(p => p.key === this.currentPropRef.prop.key)
    },
    extensions () {
      return (this.dataset.extensions || [])
        .filter(ext => ext.active)
        .filter(ext => this.remoteServicesMap[ext.remoteService] && this.remoteServicesMap[ext.remoteService].actions[ext.action])
        .reduce((a, ext) => {
          a[ext.remoteService + '/' + ext.action] = {
            ...ext,
            title: `${this.remoteServicesMap[ext.remoteService].actions[ext.action].summary}`
          }
          return a
        }, {})
    },
    groups () {
      const groupsArray = this.propertiesRefs.map(pr => pr.prop['x-group']).filter(g => !!g)
      return [...new Set(groupsArray)]
    },
    xDisplay: {
      get () {
        return this.currentPropRef.prop['x-display'] || 'singleline'
      },
      set (value) {
        if (value === 'singleline') this.$delete(this.currentPropRef.prop, 'x-display')
        else this.$set(this.currentPropRef.prop, 'x-display', value)
      }
    },
    maxLength: {
      get () {
        return this.currentPropRef.prop.maxLength
      },
      set (value) {
        if (!value) this.$delete(this.currentPropRef.prop, 'maxLength')
        else this.$set(this.currentPropRef.prop, 'maxLength', value)
      }
    }
  },
  watch: {
    'properties.length' () {
      this.currentProperty = null
    }
  },
  async created () {
    await this.fetchRemoteServices()
  },
  methods: {
    ...mapActions('dataset', ['fetchRemoteServices', 'patch']),
    btnProps (prop, originalProp, warning, i, active) {
      if (active) return { color: 'primary', dark: true, depressed: true, small: true }
      if (warning) return { color: 'warning', dark: true, text: true, small: true }
      if (this.editable && JSON.stringify(prop) !== JSON.stringify(originalProp)) {
        return { color: 'accent', dark: true, text: true, small: true }
      }
      return { color: 'transparent', depressed: true, small: true }
    },
    filterVocabulary (item) {
      if (item.header) return true
      const prop = this.currentPropRef.prop
      if (this.propertiesRefs.find(pr => (pr.prop['x-refersTo'] === item.value) && (pr.key !== prop.key))) return false
      // accept different type if the concept's type is String
      // in this case we will ignore the detected type and apply string
      if (prop.type === 'integer' && item.type === 'number') return true
      if (prop.type !== item.type && item.type !== 'string') return false
      if (item.format === 'date-time' && prop.format !== 'date-time' && prop.format !== 'date') return false
      return true
    },
    setMasterData (masterData) {
      if (!masterData) {
        this.$delete(this.currentPropRef.prop, 'x-master')
        delete this.currentPropRef.prop['x-fromUrl']
        delete this.currentPropRef.prop['x-itemKey']
        delete this.currentPropRef.prop['x-itemTitle']
        delete this.currentPropRef.prop['x-itemsProp']
      } else {
        this.$set(this.currentPropRef.prop, 'x-master', { id: masterData.id, title: masterData.title, service: masterData.service, action: masterData.action })
        this.currentPropRef.prop['x-fromUrl'] = masterData['x-fromUrl']
        this.currentPropRef.prop['x-itemKey'] = masterData['x-itemKey']
        if (masterData['x-itemTitle']) this.currentPropRef.prop['x-itemTitle'] = masterData['x-itemTitle']
        this.currentPropRef.prop['x-itemsProp'] = 'results'
      }
    },
    async switchProperty (i) {
      if (this.currentProperty === i) {
        this.currentProperty = null
      } else {
        this.currentProperty = null
        await this.$nextTick()
        this.currentProperty = i
      }
    },
    async setGroup (group) {
      if (group) {
        this.$set(this.currentPropRef.prop, 'x-group', group)
      } else if (this.currentPropRef.prop['x-group']) {
        this.currentPropRef.prop['x-group'] = undefined
      }
    }
  }
}
</script>

<style lang="css">
.properties-slide .v-slide-group__wrapper {
  overflow-x: visible;
}

.properties-slide .v-slide-group__prev, .properties-slide .v-slide-group__next {
  width: 0;
  min-width: 0;
  flex: none;
}

.v-btn.property-ghost {
  opacity: 0.5;
  background-color: #c8ebfb!important;
}

.labels-list .v-list-item {
  min-height: 30px;
}
</style>
