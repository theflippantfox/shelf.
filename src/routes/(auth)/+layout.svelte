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
    <!-- Brand mark -->
    <div class="flex items-center justify-center gap-2 mb-8">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center"
           style="background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, black)); box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--primary) 50%, transparent);">
        <span class="font-serif text-white text-[20px] leading-none">S</span>
      </div>
      <span class="font-serif text-[26px] text-[var(--text)] tracking-tight">Shëlf<span class="text-[var(--primary)]">.</span></span>
    </div>

    {@render children()}

    <p class="text-center text-[11px] text-[var(--text-3)] mt-6">
      © {new Date().getFullYear()} Shëlf POS · Built for independent retailers
    </p>
  </div>
</div>