<script lang="ts">
  let {
    class: cls  = '',
    height      = '16px',
    width       = '100%',
    rounded     = 'rounded',
  }: {
    class?:   string;
    height?:  string;
    width?:   string;
    rounded?: string;
  } = $props();
</script>

<div
  class="animate-pulse bg-[var(--surface2)] {rounded} {cls}"
  style="height:{height};width:{width}"
  aria-hidden="true"
></div>
