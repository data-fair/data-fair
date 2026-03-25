<script setup lang="ts">
const route = useRoute<'/dataset/[id]/data'>()
const router = useRouter()
router.replace(`/dataset/${route.params.id}/table`)
</script>
