<template>
  <v-sheet class="properties-slide">
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
          @click="currentProperty = currentProperty === i ? null : i"
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
    <v-row v-if="currentProperty == null" class="ma-0">
      <v-subheader v-t="'detailedInfo'" />
    </v-row>
    <v-expand-transition>
      <v-sheet v-if="currentProperty != null">
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
        <v-row>
          <v-col>
            <v-text-field
              v-model="currentPropRef.prop.title"
              :placeholder="currentPropRef.prop['x-originalName'] || ' '"
              label="Libellé"
              :disabled="!editable || !currentPropRef.editable"
              hide-details
            />
            <v-textarea
              v-model="currentPropRef.prop.description"
              class="pt-2"
              label="Description"
              :disabled="!editable || !currentPropRef.editable"
              hide-details
              rows="7"
              filled
            />
          </v-col>
          <v-col>
            <v-row v-if="editable && currentPropRef.editable && !dataset.isVirtual" class="ma-0">
              <v-spacer />
              <div class="mx-1">
                <confirm-menu
                  v-if="user.adminMode && editable && currentPropRef.editable && dataset.isRest"
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
                  :editable="editable && currentPropRef.editable && !dataset.isVirtual"
                />
              </div>
              <div class="mx-1">
                <dataset-property-labels
                  v-if="(currentPropRef.prop.type === 'string' && (!currentPropRef.prop.format || currentPropRef.prop.format === 'uri-reference') || currentPropRef.prop.type === 'boolean')"
                  :property="currentPropRef.prop"
                  :editable="editable && currentPropRef.editable && !dataset.isVirtual"
                  :is-rest="dataset.isRest"
                />
              </div>
            </v-row>
            <v-list dense>
              <v-list-item v-if="currentPropRef.prop['x-extension'] && extensions[currentPropRef.prop['x-extension']]" class="pl-0 font-weight-bold">
                <span :class="labelClass">{{ $t('extension') }}</span>&nbsp;
                {{ extensions[currentPropRef.prop['x-extension']].title }}
              </v-list-item>
              <v-list-item class="pl-0">
                <span :class="labelClass">{{ $t('key') }}</span>&nbsp;
                {{ currentPropRef.prop['x-originalName'] || currentPropRef.prop.key }}
              </v-list-item>
              <v-list-item class="pl-0">
                <span :class="labelClass">Type :</span>&nbsp;
                {{ propTypeTitle(currentPropRef.prop) }}
                <template v-if="currentFileProp && currentFileProp.dateFormat">
                  ({{ currentFileProp.dateFormat }})
                </template>
                <template v-if="currentFileProp && currentFileProp.dateTimeFormat">
                  ({{ currentFileProp.dateTimeFormat }})
                </template>
              </v-list-item>
              <v-list-item v-if="currentPropRef.prop['x-cardinality']" class="pl-0">
                <span :class="labelClass">{{ $t('distinctValues') }} <v-icon :title="$t('distinctValuesHelp')" v-text="'mdi-information'" /> : </span>&nbsp;
                {{ currentPropRef.prop['x-cardinality'].toLocaleString() }}
              </v-list-item>
              <v-list-item v-if="currentPropRef.prop.enum" class="pl-0">
                <span :class="labelClass">{{ $t('values') }}</span>&nbsp;
                {{ currentPropRef.prop.enum.join(' - ') | truncate(100) }}
              </v-list-item>
            </v-list>
            <template v-if="currentPropRef.prop.type === 'string' && currentFileProp.dateTimeFormat">
              <lazy-time-zone-select
                v-model="currentPropRef.prop.timeZone"
                :disabled="!editable || !currentPropRef.editable || dataset.isVirtual"
              />
            </template>
            <v-select
              v-if="currentPropRef.prop.type === 'string'"
              v-model="currentPropRef.prop.separator"
              :items="[', ', '; ', ' - ', ' / ']"
              :disabled="!editable || !currentPropRef.editable || dataset.isVirtual"
              :label="$t('sep')"
              persistent-hint
              clearable
              :hint="$t('separatorHelp')"
            />
            <v-autocomplete
              v-model="currentPropRef.prop['x-refersTo']"
              :items="vocabularyItems.filter(item => filterVocabulary(item))"
              :disabled="!editable || !currentPropRef.editable || dataset.isVirtual"
              label="Concept"
              :clearable="true"
              persistent-hint
              :hint="currentPropRef.prop['x-refersTo'] ? vocabulary[currentPropRef.prop['x-refersTo']] && vocabulary[currentPropRef.prop['x-refersTo']].description : 'Les concepts des colonnes sont utilisés pour améliorer le traitement de la donnée et sa visualisation.'"
            >
              <template v-slot:item="data">
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
            </v-autocomplete>
            <v-checkbox
              v-if="dataset.file && dataset.file.mimetype === 'text/csv'"
              v-model="currentPropRef.prop.ignoreDetection"
              :disabled="!editable || !currentPropRef.editable"
              :label="$t('ignoreDetection')"
              persistent-hint
              :hint="$t('ignoreDetectionHelp')"
            />
            <v-checkbox
              v-if="dataset.file && dataset.file.mimetype === 'text/csv' && ['integer', 'number'].includes(currentPropRef.prop.type)"
              v-model="currentPropRef.prop.ignoreIntegerDetection"
              :disabled="!editable || !currentPropRef.editable"
              :label="$t('ignoreIntegerDetection')"
              persistent-hint
              :hint="$t('ignoreIntegerDetectionHelp')"
            />
            <v-checkbox
              v-if="dataset.isRest"
              v-model="currentPropRef.prop.readOnly"
              :disabled="!editable || !currentPropRef.editable"
              :label="$t('readOnly')"
              persistent-hint
              :hint="$t('readOnlyHelp')"
            />
            <v-select
              v-if="currentPropRef.prop['x-refersTo'] && availableMasters[currentPropRef.prop['x-refersTo']]"
              item-value="id"
              item-text="title"
              :items="availableMasters[currentPropRef.prop['x-refersTo']]"
              :value="currentPropRef.prop['x-master']"
              :label="$t('masterData')"
              :clearable="true"
              :return-object="true"
              @input="setMasterData"
            />
          </v-col>
        </v-row>
      </v-sheet>
    </v-expand-transition>
  </v-sheet>
</template>

<i18n lang="yaml">
fr:
  detailedInfo: Cliquez sur un nom de colonne pour afficher ses informations détaillées.
  extension: "Extension : "
  key: "Clé dans la source : "
  distinctValues: Nombre de valeurs distinctes
  distinctValuesHelp: approximatif dans le cas de données volumineuses
  values: "Valeurs : "
  sep: Séparateur
  separatorHelp: Ne renseigner que pour les colonnes multivaluées. Ce caractère sera utilisé pour séparer les valeurs.
  ignoreDetection: Ignorer la détection de type
  ignoreDetectionHelp: Si vous cochez cette case la détection automatique de type sera désactivée et la colonne sera traitée comme un simple texte.
  ignoreIntegerDetection: Traiter comme un nombre flottant
  ignoreIntegerDetectionHelp: Si vous cochez cette case la détection du type "nombre entier" sera désactivée et le nombre sera traité comme un nombre flottant. Cette étape peut être nécessaire pour rendre compatibles des jeux de données avant de les joindre dans un jeu virtuel.
  readOnly: Lecture seule
  readOnlyHelp: Si vous cochez cette case la colonne sera affichée en lecture seule dans le formulaire de saisie.
  masterData: Valeurs issues d'une donnée de référence
  deletePropertyTitle: Supprimer la colonne
  deletePropertyText: Souhaitez vous supprimer cette colonne ? Attention la donnée sera effacée et définitivement perdue !
en:
  detailedInfo: Click on a column title to display its detailed information.
  extension: "Extension: "
  key: "Key in the source: "
  distinctValues: Number of istinct values
  distinctValuesHelp: approximative in the case of a large dataset
  values: "Values: "
  sep: Separator
  separatorHelp: Only provide for multi-values columns. This character will be used to separate the values.
  ignoreDetection: Ignore type detection
  ignoreDetectionHelp: If you check this box the automatic detection of type will be disabled and the column will be processed as a simple string.
  ignoreIntegerDetection: Handle as a floating number
  ignoreIntegerDetectionHelp: If you check this box the detection of the type integer will be disabled and column will be processed as a floating number. This step might be necessary to make datasets compatibles before joining them in a virtual dataset.
  readOnly: Read only
  readOnlyHelp: If you check this box the column will be rendered as a read only field in the input form.
  masterData: Values coming from a master-data dataset
  deletePropertyTitle: Delete the column
  deletePropertyText: Do you want to delete this column ? Warning, data will be definitively erased !
</i18n>

<script>
  import { mapState, mapGetters, mapActions } from 'vuex'
  const Draggable = require('vuedraggable')

  const datasetSchema = require('~/../contract/dataset.js')
  export default {
    components: { Draggable },
    props: ['propertiesRefs', 'editable', 'sortable'],
    data() {
      return {
        datasetSchema,
        currentProperty: null,
      }
    },
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['vocabulary', 'vocabularyArray', 'vocabularyItems']),
      ...mapState('dataset', ['dataset', 'remoteServices']),
      ...mapGetters(['propTypeTitle', 'propTypeIcon']),
      ...mapGetters('dataset', ['remoteServicesMap', 'availableMasters']),
      labelClass() {
        return `theme--${this.$vuetify.theme.dark ? 'dark' : 'light'} v-label`
      },
      currentPropRef() {
        return this.currentProperty !== null && this.propertiesRefs[this.currentProperty]
      },
      currentFileProp() {
        return this.dataset.file &&
          this.dataset.file.schema &&
          this.currentPropRef &&
          this.currentPropRef.prop &&
          this.dataset.file.schema.find(p => p.key === this.currentPropRef.prop.key)
      },
      extensions() {
        return (this.dataset.extensions || [])
          .filter(ext => ext.active)
          .filter(ext => this.remoteServicesMap[ext.remoteService] && this.remoteServicesMap[ext.remoteService].actions[ext.action])
          .reduce((a, ext) => {
            a[ext.remoteService + '/' + ext.action] = {
              ...ext,
              title: `${this.remoteServicesMap[ext.remoteService].actions[ext.action].summary}`,
            }
            return a
          }, {})
      },
    },
    watch: {
      'properties.length'() {
        this.currentProperty = null
      },
    },
    async created() {
      await this.fetchRemoteServices()
    },
    methods: {
      ...mapActions('dataset', ['fetchRemoteServices', 'patch']),
      btnProps(prop, originalProp, warning, i, active) {
        if (active) return { color: 'primary', dark: true, outlined: true, small: true }
        if (warning) return { color: 'warning', dark: true, text: true, small: true }
        if (this.editable && JSON.stringify(prop) !== JSON.stringify(originalProp)) {
          return { color: 'accent', dark: true, text: true, small: true }
        }
        return { color: 'transparent', depressed: true, small: true }
      },
      filterVocabulary(item) {
        if (item.header) return true
        const prop = this.currentPropRef.prop
        if (this.propertiesRefs.find(pr => (pr.prop['x-refersTo'] === item.value) && (pr.key !== prop.key))) return false
        // accept different type if the concept's type is String
        // in this case we will ignore the detected type and apply string
        if (prop.type !== item.type && item.type !== 'string') return false
        if (item.format === 'date-time' && prop.format !== 'date-time' && prop.format !== 'date') return false
        return true
      },
      setMasterData(masterData) {
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
    },
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
</style>
