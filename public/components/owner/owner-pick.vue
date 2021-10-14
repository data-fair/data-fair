<template lang="html">
  <v-row>
    <v-col>
      <p>Le propriétaire est le seul à pouvoir modifier la ressource.</p>
      <v-radio-group
        v-if="selectedOwner"
        v-model="selectedOwner"
        class="mt-3 mb-3"
      >
        <v-radio
          v-for="(owner, $index) in owners.filter(o => !restriction || restriction.find(r => r.type === o.type && r.id === o.id))"
          :key="$index"
          :label="owner.label"
          :value="owner"
        />
      </v-radio-group>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  yourself: Vous-même
  org: Organisation
en:
  yourself: Yourself
  org: Organization
</i18n>

<script>
  import { mapState } from 'vuex'

  export default {
    props: ['value', 'restriction', 'currentOwner'],
    data: () => ({
      selectedOwner: null,
      owners: null,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
    },
    watch: {
      selectedOwner(owner) {
        this.selectedRole = null
        this.update()
      },
    },
    async created() {
      if (!this.user) return

      this.owners = [{ type: 'user', id: this.user.id, name: this.user.name, label: this.$t('yourself') }]
      for (const o of this.user.organizations) {
        this.owners.push({ type: 'organization', id: o.id, name: o.name, label: `${this.$t('org')} ${o.name}` })
        const org = await this.$axios.$get(`${this.env.directoryUrl}/api/organizations/${o.id}`)
        if (!org.departments) continue
        for (const dep of org.departments) {
          this.owners.push({ type: 'organization', id: o.id, name: o.name, department: dep.id, label: `${this.$t('org')} ${o.name} (${dep.name})` })
        }
      }

      if (this.currentOwner) {
        this.selectedOwner = this.owners.find(o => o.type === this.currentOwner.type && o.id === this.currentOwner.id && o.department === this.currentOwner.department)
      }
      this.selectedOwner = this.selectedOwner || this.owners[0]
    },
    methods: {
      update () {
        const newOwner = { ...this.selectedOwner }
        delete newOwner.label
        this.$emit('input', newOwner)
      },
    },
  }
</script>
