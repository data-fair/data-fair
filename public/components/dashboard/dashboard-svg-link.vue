<template>
  <v-card
    outlined
    tile
    hover
    :to="to"
  >
    <v-card-title
      style="word-break:normal;line-break:1.5rem;"
      class="primary--text pb-0"
      v-text="title"
    />
    <v-responsive :aspect-ratio="16/9">
      <layout-wrap-svg
        :source="svg"
        style="height:100%;width:100%;"
      />
    </v-responsive>
  </v-card>
</template>

<script>
export default {
  props: {
    to: { type: String, required: true },
    svg: { type: String, required: true },
    title: { type: String, required: true }
  }
}
</script>

<style>

</style>
