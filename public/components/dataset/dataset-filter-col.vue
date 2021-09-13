<template>
  <v-menu
    v-if="showEnum || showEquals || showStartsWith"
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
    <v-sheet>
      <v-text-field
        v-if="showEquals"
        v-model="equals"
        label="égal"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="emitFilter(equals)"
      />
      <v-text-field
        v-if="showStartsWith"
        v-model="startsWith"
        label="commence par"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="emitFilter({value: startsWith, type: 'starts'})"
      />
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
    </v-sheet>
  </v-menu>
</template>

<script>
  export default {
    props: ['field', 'filterHeight'],
    data() {
      return { showMenu: false, equals: '', startsWith: '' }
    },
    computed: {
      showEnum() {
        return this.field.enum && this.field['x-cardinality'] > 1
      },
      showEquals() {
        return !this.showEnum && this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')
      },
      showStartsWith() {
        return this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')
      },
    },
    methods: {
      emitFilter(filter) {
        this.$emit('filter', filter)
        this.showMenu = false
        this.equals = ''
        this.startsWith = ''
      },
    },
  }
</script>

<style>

</style>
