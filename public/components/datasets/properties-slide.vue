<template>
  <v-sheet>
    <v-slide-group v-model="currentProperty" show-arrows>
      <v-slide-item
        v-for="prop in properties"
        :key="prop.key"
        v-slot:default="{ active, toggle }"
      >
        <v-card
          width="230"
          class="ma-1"
          :outlined="!active"
          :dark="active"
          :color="active && 'primary'"
          @click="toggle"
        >
          <v-card-title primary-title>
            {{ prop['x-originalName'] }}
          </v-card-title>
          <v-card-text>
            <p>
              <span>{{ prop.type }}</span><span v-if="prop.format"> - {{ prop.format }}</span>
            </p>
          </v-card-text>
        </v-card>
      </v-slide-item>
    </v-slide-group>
    <v-expand-transition>
      <v-sheet v-if="currentProperty != null">
        {{ properties[currentProperty] }}
      </v-sheet>
    </v-expand-transition>
  </v-sheet>
</template>

<script>
  const datasetSchema = require('~/../contract/dataset.js')
  export default {
    props: ['properties'],
    data() {
      return {
        datasetSchema,
        propertiesByKeys: {},
        propertiesValidity: {},
        currentProperty: null,
      }
    },
    created() {
      this.properties.forEach(p => {
        this.$set(this.propertiesByKeys, p.key, p)
        this.$set(this.propertiesValidity, p.key, true)
      })
    },
  }
</script>

<style lang="css" scoped>
</style>
