<template>
  <v-dialog
    :value="value"
    max-width="500px"
  >
    <v-card outlined>
      <v-card-title
        v-t="'addProperty'"
        primary-title
      />
      <v-card-text>
        <v-form
          v-if="value"
          ref="form"
          :lazy-validation="true"
        >
          <v-text-field
            v-model="newPropertyKey"
            :rules="[v => !!v || '', v => !schema.find(f => f['x-originalName'] === v || f.key === v) || '']"
            name="key"
            label="Clé"
          />
          <v-select
            v-model="newPropertyType"
            :items="propertyTypes"
            :item-text="item => item.title"
            :item-value="item => `${item.type}${item.format || item['x-display']}`"
            :rules="[v => !!v || '']"
            return-object
            label="Type"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          v-t="'cancel'"
          text
          @click="$emit('input', false)"
        />
        <v-btn
          v-t="'validate'"
          color="primary"
          @click="addProperty"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    addProperty: Ajouter une propriété
    cancel: Annuler
    validate: Valider
  en:
    addProperty: Add a property
    cancel: Cancel
    validate: Validate
  </i18n>

<script>
import { mapState } from 'vuex'
import { escapeKey } from '../../assets/dataset-utils'

export default {
  props: {
    value: {
      type: Boolean
    },
    schema: {
      type: Array,
      required: true
    }
  },
  data () {
    return {
      newPropertyKey: null,
      newPropertyType: null
    }
  },
  computed: {
    ...mapState(['propertyTypes'])
  },
  watch: {
    value () {
      this.newPropertyKey = ''
      this.newPropertyType = null
    }
  },
  methods: {
    addProperty () {
      if (this.$refs.form.validate()) {
        this.$emit('add', { key: escapeKey(this.newPropertyKey), 'x-originalName': this.newPropertyKey, ...this.newPropertyType, title: '' })
        this.$emit('input', false)
      }
    }
  }
}
</script>
