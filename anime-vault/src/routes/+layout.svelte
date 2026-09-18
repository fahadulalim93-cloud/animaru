<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(body) {
    margin: 0;
    background: #0a0a0a;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    overflow-x: hidden;
  }
</style>
