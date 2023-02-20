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
  yourself: Compte personnel
  org: Organisation
en:
  yourself: Personal account
  org: Organization
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: ['value', 'restriction', 'currentOwner'],
  data: () => ({
    selectedOwner: null,
    owners: null
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  watch: {
    selectedOwner (owner) {
      this.selectedRole = null
      this.update()
    }
  },
  async created () {
    if (!this.user) return

    this.owners = [{ type: 'user', id: this.user.id, name: this.user.name, label: this.$t('yourself') }]
    for (const o of this.user.organizations.filter(o => ['contrib', 'admin'].includes(o.role))) {
      if (o.department && !this.owners.find(ow => ow.type === 'organization' && ow.id === o.id && ow.department === o.department)) {
        this.owners.push({ type: 'organization', id: o.id, name: o.name, department: o.department, departmentName: o.departmentName || '', label: `${this.$t('org')} ${o.name} / ${o.departmentName || o.department}` })
      }
      if (!o.department) {
        const org = await this.$axios.$get(`${this.env.directoryUrl}/api/organizations/${o.id}`)
        this.owners.push({ type: 'organization', id: o.id, name: o.name, label: `${this.$t('org')} ${o.name}` })
        if (!org.departments) continue
        for (const dep of org.departments) {
          if (!this.owners.find(ow => ow.type === 'organization' && ow.id === o.id && ow.department === dep.id)) {
            this.owners.push({ type: 'organization', id: o.id, name: o.name, department: dep.id, departmentName: dep.name, label: `${this.$t('org')} ${o.name} / ${dep.name || dep.id}` })
          }
        }
      }
    }

    if (this.currentOwner) {
      this.selectedOwner = this.owners.find(o => o.type === this.currentOwner.type && o.id === this.currentOwner.id && (o.department || null) === (this.currentOwner.department || null))
    }
    this.selectedOwner = this.selectedOwner || this.owners[0]
  },
  methods: {
    update () {
      const newOwner = { ...this.selectedOwner }
      delete newOwner.label
      this.$emit('input', newOwner)
    }
  }
}
</script>
