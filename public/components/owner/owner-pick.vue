<template lang="html">
  <v-row>
    <v-col>
      <p>Le propriétaire est le seul à pouvoir modifier la ressource.</p>
      <v-radio-group
        v-model="selectedOwner"
        class="mt-3 mb-3"
      >
        <v-radio
          v-for="(owner, $index) in owners.filter(o => !restriction || restriction.find(r => r.type === o.type && r.id === o.id))"
          :key="$index"
          :label="owner.type === 'user' ? 'Vous-même' : 'Organisation ' + owner.name"
          :value="owner"
        />
      </v-radio-group>
    </v-col>
    <!--<v-col v-if="selectedOwner && selectedOwner.type === 'organization'">
      <p>Dans une organisation, vous pouvez restreindre la propriété à un rôle (les administrateurs de l'organisation seront quand même considérés comme propriétaires).</p>
      <v-radio-group
        v-model="selectedRole"
        class="mt-3 mb-3"
      >
        <v-radio
          :value="null"
          label="Organisation entière"
        />
        <v-radio
          :label="`Restreinte au rôle ${user.organizations.find(o => o.id === selectedOwner.id).role}`"
          :value="user.organizations.find(o => o.id === selectedOwner.id).role"
        />
      </v-radio-group>
    </v-col>-->
  </v-row>
</template>

<script>
  import { mapState } from 'vuex'

  export default {
    props: ['value', 'restriction'],
    data: () => ({
      selectedOwner: null,
      selectedRole: null,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      owners() {
        if (!this.user) return []
        return [
          { type: 'user', id: this.user.id, name: this.user.name },
          ...this.user.organizations.map(o => ({ type: 'organization', id: o.id, name: o.name })),
        ]
      },
    },
    watch: {
      selectedOwner(owner) {
        this.selectedRole = null
        this.update()
      },
      selectedRole() {
        this.update()
      },
    },
    created() {
      if (this.user) {
        this.selectedOwner = this.owners[0]
      }
    },
    methods: {
      update () {
        this.$emit('input', Object.assign({ role: this.selectedRole }, this.selectedOwner))
      },
    },
  }
</script>
