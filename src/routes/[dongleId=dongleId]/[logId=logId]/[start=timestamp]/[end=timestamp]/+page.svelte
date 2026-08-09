<script>
  import DrivePage from '$lib/components/drive/DrivePage.svelte';

  let { data } = $props();
</script>

<DrivePage {data} initialZoom={data.initialZoom} />
