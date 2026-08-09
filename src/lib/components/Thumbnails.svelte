<script>
  import { thumbnailTiles } from './thumbnails-tiling';

  let { thumbnail, percentToOffset, currentRoute } = $props();

  const tiles = $derived(thumbnailTiles(thumbnail, percentToOffset, currentRoute));

  function tileStyle(tile) {
    let style = `display: inline-block; height: ${tile.height}px; width: ${tile.width}px`;
    if (tile.backgroundImage) {
      style += `; background-size: ${tile.backgroundSize}; background-repeat: repeat-x`
        + `; background-image: ${tile.backgroundImage}; background-position-x: ${tile.backgroundPositionX}`;
    }
    return style;
  }
</script>

{#each tiles as tile, i (i)}
  <div class={tile.className} role="img" style={tileStyle(tile)}></div>
{/each}
