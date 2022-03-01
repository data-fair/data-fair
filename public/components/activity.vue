<template>
  <v-list
    dense
    class="list-actions"
  >
    <v-subheader
      v-if="activity.results.length"
      class="pl-4"
    >
      ACTIVITÉ
    </v-subheader>
    <v-list-item
      v-for="line of activity.results"
      :key="line.id"
      :to="`/${line.type}/${line.id}`"
    >
      <v-list-item-content>
        <v-list-item-title>
          <v-icon
            v-if="line.type === 'dataset'"
            small
          >
            mdi-database
          </v-icon>
          <v-icon
            v-if="line.type === 'application'"
            small
          >
            mdi-image-multiple
          </v-icon>
          &nbsp;{{ line.title }}
        </v-list-item-title>
        <v-list-item-subtitle>
          modification le {{ line.date | moment("L") }}
        </v-list-item-subtitle>
      </v-list-item-content>
    </v-list-item>
  </v-list>
</template>

<script>
export default {
  props: {
    activity: { type: Object, required: true }
  }
}
</script>

<style lang="css" scoped>
</style>
