<template>
  <v-sheet class="properties-slide">
    <v-slide-group
      show-arrows
    >
      <!-- empty slots to prevent rendering arrows, we prefer a horizontal scrollbar for now -->
      <div slot="prev" />
      <div slot="next" />

      <v-slide-item
        v-for="(prop, i) in properties"
        :key="prop.key"
      >
        <v-card
          min-width="100"
          class="mx-1 my-2"
          v-bind="cardProps(prop, i, currentProperty === i)"
          @click="currentProperty = currentProperty === i ? null : i"
        >
          <v-card-title primary-title>
            {{ prop.title || prop['x-originalName'] || prop.key }}
          </v-card-title>
          <v-card-subtitle class="pb-0 caption">
            {{ prop.title && prop.title !== (prop['x-originalName'] || prop.key) ? (prop['x-originalName'] || prop.key) : '&nbsp;' }}
          </v-card-subtitle>
          <v-card-text>
            <p class="mb-0">
              {{ propTypeTitle(prop) }}
            </p>
            <p v-if="prop['x-cardinality']" class="mb-0">
              {{ prop['x-cardinality'].toLocaleString() }} valeurs distinctes
            </p>
            <p v-if="prop['x-refersTo']" class="mb-0 font-weight-bold">
              {{ vocabulary[prop['x-refersTo']] && vocabulary[prop['x-refersTo']].title }}
            </p>
          </v-card-text>
        </v-card>
      </v-slide-item>
    </v-slide-group>
    <v-expand-transition>
      <v-sheet v-if="currentProperty != null">
        <v-row class="px-3">
          <v-col>
            <v-text-field
              v-model="currentPropObj.title"
              :placeholder="currentPropObj['x-originalName'] || ' '"
              label="Libellé"
              :disabled="!editable"
              hide-details
            />
            <v-textarea
              v-model="currentPropObj.description"
              class="pt-2"
              label="Description"
              :disabled="!editable"
              hide-details
              filled
            />
            <v-select
              v-model="currentPropObj.separator"
              :items="[', ', '; ', ' - ', ' / ']"
              :disabled="!editable || dataset.isVirtual"
              label="Séparateur"
              persistent-hint
              hint="Ne renseigner que pour les champs multivalués. Ce caractère sera utilisé pour séparer les valeurs."
            />
            <v-autocomplete
              v-model="currentPropObj['x-refersTo']"
              :items="vocabularyItems.filter(item => filterVocabulary(currentProperty, item))"
              :disabled="!editable || dataset.isVirtual"
              label="Concept"
              :clearable="true"
              persistent-hint
              :hint="currentPropObj['x-refersTo'] ? vocabulary[currentPropObj['x-refersTo']] && vocabulary[currentPropObj['x-refersTo']].description : 'Les concepts des champs sont utilisés pour améliorer le traitement de la donnée et sa visualisation.'"
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
              v-if="dataset.file"
              v-model="currentPropObj.ignoreDetection"
              :disabled="!editable"
              label="Ignorer la détection de type"
              persistent-hint
              hint="Si vous cochez cette case la détection automatique de type sera désactivée et la colonne sera traitée comme une simple chaîne de caractère."
            />
          </v-col>
          <v-col>
            <p>
              <span :class="labelClass">Clé normalisée :  </span><br>
              {{ currentPropObj.key }}
            </p>
            <p v-if="currentPropObj['x-originalName']">
              <span :class="labelClass">Clé dans le fichier d'origine : </span><br>
              {{ currentPropObj['x-originalName'] }}
            </p>
            <p>
              <span :class="labelClass">Type : </span><br>
              {{ propTypeTitle(currentPropObj) }}
              <template v-if="currentFileProp && currentFileProp.dateFormat">
                ({{ currentFileProp.dateFormat }})
              </template>
              <template v-if="currentFileProp && currentFileProp.dateTimeFormat">
                ({{ currentFileProp.dateTimeFormat }})
              </template>
            </p>
            <p v-if="currentPropObj['x-cardinality']">
              <span :class="labelClass">Nombre de valeurs distinctes (approximative dans le cas de données volumineuses) : </span><br>
              {{ currentPropObj['x-cardinality'].toLocaleString() }}
            </p>
            <p v-if="currentPropObj.enum">
              <span :class="labelClass">Valeurs : </span><br>
              {{ currentPropObj.enum.join(' - ') }}
            </p>
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
      ...mapGetters(['propTypeTitle']),
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
    },
    methods: {
      cardProps(prop, i, active) {
        if (active) return { color: 'primary', dark: true, elevation: 4 }
        if (this.editable && JSON.stringify(prop) !== JSON.stringify(this.originalProperties[i])) {
          return { outlined: true, color: 'accent', dark: true, tile: true }
        }
        return { outlined: true, tile: true }
      },
      filterVocabulary(currentProperty, item) {
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
