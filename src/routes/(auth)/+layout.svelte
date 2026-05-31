<script lang="ts">
  let { children } = $props();
</script>
<div class="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <span class="font-serif text-3xl" style="color:var(--primary)">Shëlf.</span>
      <p class="text-xs text-[var(--text-3)] mt-1">Your shop, simplified.</p>
    </div>
    {@render children()}
  </div>
</div>
