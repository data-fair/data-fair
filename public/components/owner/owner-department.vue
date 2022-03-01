<template>
  <span
    v-if="department"
    class="text-caption"
    style="max-width: 100px;"
  >
    {{ department.name }}
  </span>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: ['owner'],
  computed: {
    ...mapState(['env']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState('session', ['activeAccountDetails']),
    relevant () {
      return this.owner &&
          this.owner.department &&
          this.owner.type === 'organization' &&
          this.activeAccount &&
          this.activeAccount.type === 'organization' &&
          this.owner.id === this.activeAccount.id
    },
    department () {
      if (!this.relevant || !this.activeAccountDetails) return
      console.log(this.activeAccountDetails)
      return (this.activeAccountDetails.departments || []).find(d => d.id === this.owner.department)
    }
  },
  created () {
    if (this.relevant) this.$store.dispatch('session/fetchActiveAccountDetails')
  }
}
</script>

<style>

</style>
