<script setup lang="ts">
const route = useRoute()
const router = useRouter()
router.replace(`/dataset/${route.params.id}/table`)
</script>
