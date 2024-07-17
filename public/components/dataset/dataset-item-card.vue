<template>
  <v-card
    class="fill-height dataset-item-card"
    outlined
  >
    <v-card-title
      v-if="labelField || item._thumbnail"
      class="pb-0"
    >
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
    <v-card-text class="py-0 px-2">
      <div
        v-if="item._highlight && item._highlight['_file.content'] && item._highlight['_file.content'][0]"
        v-html="item._highlight['_file.content'][0].replace(/highlighted/g,'accent--text')"
      />
      <!--<div
        v-if="descriptionField && item[descriptionField.key]"
        :inner-html.prop="(item[descriptionField.key] + '')"
      />-->
      <v-list
        dense
        class="transparent pt-0"
      >
        <template v-for="(header, i) in otherHeaders">
          <v-lazy
            v-if="item[header.value] !== null && item[header.value] !== undefined && item[header.value] !== ''"
            :key="`input-${header.value}`"
            height="40"
            transition=""
            :style="noInteraction ? '' : 'cursor:pointer'"
            @mouseenter="hover(header.value)"
            @mouseleave="leave(header.value)"
          >
            <v-input
              :class="`dataset-item-card-value-${item._id}-${i}`"
              :label="header.text"
              hide-details
              style="line-height:20px;"
            >
              <dataset-item-value
                :item="item"
                :field="header.field"
                :filters="filters"
                :truncate="truncate"
                :disable-hover="true"
                :dense="true"
                style="padding-right: 16px;"
                @filter="filter => $emit('filter', {field, filter})"
              />
              <v-icon
                v-if="hovered[header.value] || header.value === pagination.sortBy[0]"
                style="position:absolute;top:16px;right:-4px;"
                :color="header.value === pagination.sortBy[0] ? 'primary' : 'default'"
              >
                <template v-if="header.value === pagination.sortBy[0] && !pagination.sortDesc[0]">mdi-sort-ascending</template>
                <template v-else-if="header.value === pagination.sortBy[0] && pagination.sortDesc[0]">mdi-sort-descending</template>
                <template v-else>mdi-menu-down</template>
              </v-icon>
            </v-input>
            <dataset-table-header-menu
              v-if="!noInteraction"
              :activator="`.dataset-item-card-value-${item._id}-${i}`"
              :header="header"
              :filters="filters"
              :filter-height="filterHeight"
              :pagination="pagination"
              no-fix
              close-on-filter
              :local-enum="header.field.separator ? item[header.value].split(header.field.separator).map(v => v.trim()) : [item[header.value]]"
              @filter="filter => $emit('filter', {header, filter})"
              @hide="$emit('hide', header)"
            >
              <template #prepend-items="{hide}">
                <v-list-item
                  v-if="shouldDisplayDetail(header.field, item[header.field.key])"
                  class="pl-2"
                  @click="$set(detailDialog, header.field.key, true); hide()"
                >
                  <v-list-item-icon class="mr-2"><v-icon>mdi-magnify-plus</v-icon></v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title>{{ $t('showFullValue') }}</v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </template>
            </dataset-table-header-menu>
            <dataset-item-detail-dialog
              v-model="detailDialog[header.field.key]"
              :item="item"
              :field="header.field"
            />
          </v-lazy>
        </template>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
  fr:
    showFullValue: Afficher la valeur entière
  en:
    showFullValue: Show full value
  </i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: {
    item: { type: Object, required: true },
    filters: { type: Array, required: false, default: () => ([]) },
    filterHeight: { type: Number, required: true },
    headers: { type: Array, required: true },
    selectedFields: { type: Array, required: false, default: () => ([]) },
    pagination: { type: Object, required: true },
    truncate: { type: Number, default: 50 },
    noInteraction: { type: Boolean, default: false }
  },
  data () {
    return {
      hovered: {},
      detailDialog: {}
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['labelField', 'descriptionField']),
    shouldDisplayDetail () {
      return (field, itemValue) => {
        if (field['x-refersTo'] === 'http://schema.org/DigitalDocument') return false
        if (field['x-refersTo'] === 'https://schema.org/WebPage') return false
        return field.type === 'string' && !field.separator && itemValue && itemValue.length > 20
      }
    },
    otherHeaders () {
      return this.headers.filter(h => {
        if (!h.field) return false
        // if (this.descriptionField && this.descriptionField.key === f.key) return false
        if (this.labelField && this.labelField.key === h.value) return false
        return true
      })
    }
  },
  methods: {
    hover (value) {
      if (this.noInteraction) return
      this._hoverTimeout = setTimeout(() => { this.$set(this.hovered, value, true) }, 60)
    },
    leave (value) {
      if (this.noInteraction) return
      if (this._hoverTimeout) {
        clearTimeout(this._hoverTimeout)
        delete this._hoverTimeout
      }
      this.$delete(this.hovered, value)
    }
  }
}
</script>

<style>

.dataset-item-card .v-input__slot {
  display: block;
  overflow: hidden;
  text-overflow:ellipsis;
}

.dataset-item-card .v-input__slot .v-label {
  font-size:12px;
  line-height: 16px;
  height: 16px;
  bottom: -2px;
  white-space:nowrap;
}
</style>
