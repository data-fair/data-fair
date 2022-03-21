<template>
  <v-menu
    v-if="showEnum || showEquals || showStartsWith || showBoolEquals || showNumCompare"
    v-model="showMenu"
    bottom
    left
    offset-y
    :max-height="filterHeight"
    :close-on-content-click="false"
  >
    <template #activator="{on, attrs}">
      <v-btn
        small
        depressed
        text
        v-bind="attrs"
        class="pa-0"
        color="primary"
        style="min-width:40px;"
        v-on="on"
      >
        <v-icon>mdi-filter-variant</v-icon>
      </v-btn>
    </template>
    <v-sheet class="pa-1">
      <v-text-field
        v-if="showEquals"
        v-model="equals"
        label="égal"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="equals && emitFilter(equals)"
      >
        <template #append-outer>
          <v-btn
            icon
            class="mr-1"
            :disabled="!equals"
            color="primary"
            @click="emitFilter(equals)"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>
      <v-text-field
        v-if="showStartsWith"
        v-model="startsWith"
        label="commence par"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="startsWith && emitFilter({value: startsWith, type: 'starts'})"
      >
        <template #append-outer>
          <v-btn
            icon
            class="mr-1"
            :disabled="!startsWith"
            color="primary"
            @click="emitFilter({value: startsWith, type: 'starts'})"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>
      <v-list
        v-if="showEnum"
        dense
        class="py-0"
      >
        <v-list-item
          v-for="value in field.enum.slice().sort()"
          :key="value"
          @click="emitFilter(value)"
        >
          {{ value | cellValues(field) }}
        </v-list-item>
      </v-list>
      <v-list
        v-if="showBoolEquals"
        dense
        class="py-0"
      >
        <v-list-item @click="emitFilter(true)">
          {{ true | cellValues(field) }}
        </v-list-item>
        <v-list-item @click="emitFilter(false)">
          {{ false | cellValues(field) }}
        </v-list-item>
      </v-list>
      <v-text-field
        v-if="showNumCompare"
        v-model="gte"
        label="supérieur ou égal à"
        outlined
        hide-details
        dense
        class="mt-1"
        type="number"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append-outer>
          <div style="width:36px;height:36px;" />
        </template>
      </v-text-field>
      <v-text-field
        v-if="showNumCompare"
        v-model="lte"
        label="inférieur ou égal à"
        outlined
        hide-details
        dense
        class="mt-1"
        type="number"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append-outer>
          <v-btn
            icon
            :disabled="!lte && !gte"
            color="primary"
            @click="emitIntervalFilter"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-sheet>
  </v-menu>
</template>

<script>
export default {
  props: ['field', 'filterHeight'],
  data () {
    return { showMenu: false, equals: '', startsWith: '', equalsBool: null, lte: null, gte: null }
  },
  computed: {
    showEnum () {
      return this.field.enum && this.field['x-cardinality'] > 1
    },
    showEquals () {
      return !this.showEnum && this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')
    },
    showBoolEquals () {
      return !this.showEnum && this.field.type === 'boolean'
    },
    showStartsWith () {
      return this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')
    },
    showNumCompare () {
      return this.field.type === 'integer' || this.field.type === 'number'
    }
  },
  methods: {
    emitIntervalFilter () {
      if (!this.gte && !this.lte) return
      this.emitFilter({
        type: 'interval',
        minValue: this.gte || '*',
        maxValue: this.lte || '*'
      })
    },
    emitFilter (filter) {
      this.$emit('filter', filter)
      this.showMenu = false
      this.equals = ''
      this.startsWith = ''
      this.equalsBool = null
      this.lte = null
      this.gte = null
    }
  }
}
</script>

<style>

</style>
