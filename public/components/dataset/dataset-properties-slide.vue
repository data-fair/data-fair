<template>
  <v-sheet class="properties-slide">
    <v-row>
      <v-btn
        v-for="(prop, i) in properties"
        :key="prop.key"
        style="text-transform: none;"
        class="ma-0 px-2"
        :class="{'font-weight-black': !!prop['x-refersTo']}"
        v-bind="btnProps(prop, i, currentProperty === i)"
        @click="currentProperty = currentProperty === i ? null : i"
      >
        <v-icon
          small
          style="margin-right:4px;"
          v-text="propTypeIcon(prop)"
        />

        {{ prop.title || prop['x-originalName'] || prop.key }}
      </v-btn>
    </v-row>
    <v-row v-if="currentProperty == null">
      <v-subheader>Cliquez sur un nom de colonne pour afficher ses informations détaillées.</v-subheader>
    </v-row>
    <v-expand-transition>
      <v-sheet v-if="currentProperty != null">
        <v-row>
          <v-col>
            <v-text-field
              v-model="currentPropObj.title"
              :placeholder="currentPropObj['x-originalName'] || ' '"
              label="Libellé"
              :disabled="!editable || !!currentPropObj['x-extension']"
              hide-details
            />
            <v-textarea
              v-model="currentPropObj.description"
              class="pt-2"
              label="Description"
              :disabled="!editable || !!currentPropObj['x-extension']"
              hide-details
              rows="7"
              filled
            />
          </v-col>
          <v-col>
            <v-list dense>
              <v-list-item v-if="currentPropObj['x-extension'] && extensions[currentPropObj['x-extension']]" class="pl-0 font-weight-bold">
                <span :class="labelClass">Extension : </span>&nbsp;
                {{ extensions[currentPropObj['x-extension']].title }}
              </v-list-item>
              <v-list-item v-if="currentPropObj['x-originalName']" class="pl-0">
                <span :class="labelClass">Clé dans la source : </span>&nbsp;
                {{ currentPropObj['x-originalName'] }}
              </v-list-item>
              <v-list-item class="pl-0">
                <span :class="labelClass">Type :</span>&nbsp;
                {{ propTypeTitle(currentPropObj) }}
                <template v-if="currentFileProp && currentFileProp.dateFormat">
                  ({{ currentFileProp.dateFormat }})
                </template>
                <template v-if="currentFileProp && currentFileProp.dateTimeFormat">
                  ({{ currentFileProp.dateTimeFormat }})
                </template>
              </v-list-item>
              <v-list-item v-if="currentPropObj['x-cardinality']" class="pl-0">
                <span :class="labelClass">Nombre de valeurs distinctes <v-icon title="approximatif dans le cas de données volumineuses" v-text="'mdi-information'" /> : </span>&nbsp;
                {{ currentPropObj['x-cardinality'].toLocaleString() }}
              </v-list-item>
              <v-list-item v-if="currentPropObj.enum" class="pl-0">
                <span :class="labelClass">Valeurs : </span>&nbsp;
                {{ currentPropObj.enum.join(' - ') | truncate(100) }}
              </v-list-item>
            </v-list>
            <v-select
              v-if="currentPropObj.type === 'string'"
              v-model="currentPropObj.separator"
              :items="[', ', '; ', ' - ', ' / ']"
              :disabled="!editable || !!currentPropObj['x-extension'] || dataset.isVirtual"
              label="Séparateur"
              persistent-hint
              clearable
              hint="Ne renseigner que pour les colonnes multivaluées. Ce caractère sera utilisé pour séparer les valeurs."
            />
            <v-autocomplete
              v-model="currentPropObj['x-refersTo']"
              :items="vocabularyItems.filter(item => filterVocabulary(item))"
              :disabled="!editable || !!currentPropObj['x-extension'] || dataset.isVirtual"
              label="Concept"
              :clearable="true"
              persistent-hint
              :hint="currentPropObj['x-refersTo'] ? vocabulary[currentPropObj['x-refersTo']] && vocabulary[currentPropObj['x-refersTo']].description : 'Les concepts des colonnes sont utilisés pour améliorer le traitement de la donnée et sa visualisation.'"
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
              v-model="currentPropObj.ignoreDetection"
              :disabled="!editable || !!currentPropObj['x-extension']"
              label="Ignorer la détection de type"
              persistent-hint
              hint="Si vous cochez cette case la détection automatique de type sera désactivée et la colonne sera traitée comme un simple texte."
            />
          </v-col>
        </v-row>
      </v-sheet>
    </v-expand-transition>
  </v-sheet>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  const datasetSchema = require('~/../contract/dataset.js')
  export default {
    props: ['properties', 'originalProperties', 'editable'],
    data() {
      return {
        datasetSchema,
        currentProperty: null,
      }
    },
    computed: {
      ...mapState(['vocabulary', 'vocabularyArray', 'vocabularyItems']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters(['propTypeTitle', 'propTypeIcon']),
      ...mapGetters('dataset', ['remoteServicesMap']),
      labelClass() {
        return `theme--${this.$vuetify.theme.dark ? 'dark' : 'light'} v-label`
      },
      currentPropObj() {
        return this.currentProperty !== null && this.properties[this.currentProperty]
      },
      currentFileProp() {
        return this.dataset.file &&
          this.dataset.file.schema &&
          this.currentPropObj &&
          this.dataset.file.schema.find(p => p.key === this.currentPropObj.key)
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
    methods: {
      btnProps(prop, i, active) {
        if (active) return { color: 'primary', dark: true, outlined: true, small: true }
        if (this.editable && JSON.stringify(prop) !== JSON.stringify(this.originalProperties.find(p => p.key === prop.key))) {
          return { color: 'accent', dark: true, text: true, small: true }
        }
        return { color: 'transparent', depressed: true, small: true }
      },
      filterVocabulary(item) {
        if (item.header) return true
        const prop = this.currentPropObj
        if (this.properties.find(f => (f['x-refersTo'] === item.value) && (f.key !== prop.key))) return false
        // accept different type if the concept's type is String
        // in this case we will ignore the detected type and apply string
        if (prop.type !== item.type && item.type !== 'string') return false
        if (item.format === 'date-time' && prop.format !== 'date-time' && prop.format !== 'date') return false
        return true
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
</style>
