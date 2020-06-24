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
          @click="currentProperty = i"
        >
          <v-card-title primary-title>
            {{ prop.title || prop['x-originalName'] || prop.key }}
          </v-card-title>
          <v-card-subtitle class="pb-0 caption">
            {{ prop.title && prop.title !== (prop['x-originalName'] || prop.key) ? (prop['x-originalName'] || prop.key) : '&nbsp;' }}
          </v-card-subtitle>
          <v-card-text>
            <p class="mb-0">
              <span>{{ propertyTypes.find(p => p.type === prop.type).title }}</span>
              <span v-if="prop.format && prop.format !== 'uri-reference'"> - {{ prop.format }}</span>
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
              v-model="properties[currentProperty].title"
              :placeholder="properties[currentProperty]['x-originalName'] || ' '"
              label="Libellé"
              :disabled="!editable"
              hide-details
            />
            <v-textarea
              v-model="properties[currentProperty].description"
              class="pt-2"
              label="Description"
              :disabled="!editable"
              hide-details
              filled
            />
            <v-select
              v-model="properties[currentProperty].separator"
              :items="[', ', '; ', ' - ', ' / ']"
              :disabled="!editable"
              label="Séparateur"
              persistent-hint
              hint="Ne renseigner que pour les champs multivalués. Ce caractère sera utilisé pour séparer les valeurs."
            />
            <v-select
              v-model="properties[currentProperty]['x-refersTo']"
              :items="fieldsVocabulary[properties[currentProperty].key]"
              :disabled="!editable"
              item-text="title"
              item-value="id"
              label="Concept"
              hide-details
            />
          </v-col>
          <v-col>
            <p>
              <span class="theme--light v-label">Clé normalisée :  </span><br>
              {{ properties[currentProperty].key }}
            </p>
            <p v-if="properties[currentProperty]['x-originalName']">
              <span class="theme--light v-label">Clé dans le fichier d'origine : </span><br>
              {{ properties[currentProperty]['x-originalName'] }}
            </p>
            <p>
              <span class="theme--light v-label">Type : </span><br>
              {{ propertyTypes.find(p => p.type === properties[currentProperty].type).title }}
            </p>
            <p v-if="properties[currentProperty].format">
              <span class="theme--light v-label">Format : </span><br>
              {{ properties[currentProperty].format }}
            </p>
            <p v-if="properties[currentProperty]['x-cardinality']">
              <span class="theme--light v-label">Nombre de valeurs distinctes (approximative dans le cas de jeux volumineux) : </span><br>
              {{ properties[currentProperty]['x-cardinality'].toLocaleString() }}
            </p>
            <p v-if="properties[currentProperty].enum">
              <span class="theme--light v-label">Valeurs : </span><br>
              {{ properties[currentProperty].enum.join(' - ') }}
            </p>
          </v-col>
        </v-row>
      </v-sheet>
    </v-expand-transition>
  </v-sheet>
</template>

<script>
  import { mapState } from 'vuex'
  const datasetSchema = require('~/../contract/dataset.js')
  export default {
    props: ['properties', 'originalProperties', 'editable'],
    data() {
      return {
        datasetSchema,
        propertiesByKeys: {},
        propertiesValidity: {},
        currentProperty: null,
      }
    },
    computed: {
      ...mapState(['vocabulary', 'vocabularyArray', 'propertyTypes']),
      fieldsVocabulary() {
        return this.properties.reduce((a, field) => {
          if (field['x-extension']) return a
          a[field.key] = [{ title: 'Aucun concept', id: null }].concat(this.vocabularyArray
            .map(term => ({ title: term.title, id: term.identifiers[0] }))
            .filter(term => !this.properties.find(f => (f['x-refersTo'] === term.id) && (f.key !== field.key))))
          return a
        }, {})
      },
    },
    created() {
      this.properties.forEach(p => {
        this.$set(this.propertiesByKeys, p.key, p)
        this.$set(this.propertiesValidity, p.key, true)
      })
    },
    methods: {
      cardProps(prop, i, active) {
        if (active) return { color: 'primary', dark: true, elevation: 4 }
        if (this.editable && JSON.stringify(prop) !== JSON.stringify(this.originalProperties[i])) {
          return { outlined: true, color: 'accent', dark: true, tile: true }
        }
        return { outlined: true, tile: true }
      },
    },
  }
</script>

<style lang="css">
.properties-slide .v-slide-group__wrapper {
  overflow-x: visible;
}
.properties-slide .v-slide-group__prev {
  width: 0;
  min-width: 0;
}
.properties-slide .v-slide-group__next {
  width: 0;
  min-width: 0;
}
</style>
