<template lang="html">
  <v-container>
    <permissions :resource="dataset" :resource-url="resourceUrl" :api="api"/>
  </v-container>
</template>

<script>
import {mapState, mapGetters} from 'vuex'
import Permissions from '../../../components/Permissions.vue'

export default {
  components: {Permissions},
  computed: {
    ...mapState('dataset', ['dataset', 'api']),
    ...mapGetters('dataset', ['resourceUrl'])
  }
}
</script>

<style lang="css">
</style>
