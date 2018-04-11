<template lang="html">
  <v-container>
    <permissions :resource="remoteService" :resource-url="resourceUrl" :api="api"/>
  </v-container>
</template>

<script>
import {mapState, mapGetters} from 'vuex'
import Permissions from '../../../components/Permissions.vue'

export default {
  components: {Permissions},
  computed: {
    ...mapState('remoteService', ['remoteService', 'api']),
    ...mapGetters('remoteService', ['resourceUrl'])
  }
}
</script>

<style lang="css">
</style>
