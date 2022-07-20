<template>
  <v-card
    class="fill-height dataset-item-card"
    outlined
  >
    <v-card-title class="pb-0">
      <v-row class="ma-0">
        <v-avatar
          v-if="item._thumbnail"
          tile
          style="position:relative;top:-12px;left:-12px;"
        >
          <img :src="item._thumbnail">
        </v-avatar>
        <h5
          v-if="labelField && item[labelField.key]"
          style="word-break: normal;line-height:18px"
        >
          {{ item[labelField.key] }}
        </h5>
      </v-row>
    </v-card-title>
    <v-card-text class="py-1">
      <div
        v-if="item._highlight"
        v-html="item._highlight['_file.content'][0].replace(/highlighted/g,'accent--text')"
      />
      <!--<div
        v-if="descriptionField && item[descriptionField.key]"
        :inner-html.prop="(item[descriptionField.key] + '')"
      />-->
      <div style="flex: 1;" />
      <v-list
        dense
        class="transparent pt-0"
      >
        <template v-for="field in otherFields">
          <v-input
            v-if="item[field.key] !== null && item[field.key] !== undefined && item[field.key] !== ''"
            :key="field.key"
            :label="field.title ? field.title : (field['x-originalName'] || field.key)"
            hide-details
          >
            <dataset-item-value
              :item="item"
              :field="field"
              :filters="filters"
              :truncate="truncate"
              @filter="filter => $emit('filter', {field, filter})"
            />
          </v-input>
        </template>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    selectedFields: { type: Array, required: false, default: () => ([]) },
    truncate: { type: Number, default: 50 }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['labelField', 'descriptionField']),
    otherFields () {
      return this.dataset.schema.filter(f => {
        if (f['x-calculated']) return false
        if (this.selectedFields.length && !this.selectedFields.includes(f.key)) return false
        // if (this.descriptionField && this.descriptionField.key === f.key) return false
        if (this.labelField && this.labelField.key === f.key) return false
        return true
      })
    }
  }
}
</script>

<style>

.dataset-item-card .v-input__slot {
  display: block;
}

.dataset-item-card .v-input__slot .v-label {
  font-size:12px;
  line-height: 16px;
  height: 16px;
  bottom: -4px;
}
</style>
