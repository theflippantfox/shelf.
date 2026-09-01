<script lang="ts">
  let { children } = $props();
</script>

<div class="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
  <!-- Brand ambient background: subtle primary glow + dotted texture -->
  <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
    <div class="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full"
         style="background: radial-gradient(circle, color-mix(in srgb, var(--primary) 22%, transparent) 0%, transparent 60%); filter: blur(20px);"></div>
    <div class="absolute -bottom-32 -right-32 w-[34rem] h-[34rem] rounded-full"
         style="background: radial-gradient(circle, color-mix(in srgb, var(--primary) 14%, transparent) 0%, transparent 60%); filter: blur(20px);"></div>
    <!-- Subtle dot pattern -->
    <div class="absolute inset-0 opacity-[0.35]"
         style="background-image: radial-gradient(circle, var(--text-3) 0.5px, transparent 0.5px); background-size: 24px 24px; mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%); -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);"></div>
  </div>

  <div class="relative w-full max-w-[400px] anim-in">
    <!-- Brand mark — matches the sidebar's exact structure -->
    <div class="sidebar-brand" style="border-bottom: none; padding: 0 0 24px; justify-content: center; gap: 10px;">
      <span class="sidebar-brand-mark">S</span>
      <span class="sidebar-brand-text" style="color: var(--text);">Shëlf<span class="sidebar-brand-dot">.</span></span>
    </div>

    {@render children()}

    <p class="text-center text-[11px] text-[var(--text-3)] mt-6">
      © {new Date().getFullYear()} Shëlf POS · Built for independent retailers
    </p>
  </div>
</div>