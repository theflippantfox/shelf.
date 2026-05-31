<script lang="ts">
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';

  let {
    open    = $bindable(false),
    title   = 'Confirm',
    message = 'Are you sure?',
    danger  = false,
    loading = false,
    onconfirm,
    oncancel,
  }: {
    open?:      boolean;
    title?:     string;
    message?:   string;
    danger?:    boolean;
    loading?:   boolean;
    onconfirm?: () => void;
    oncancel?:  () => void;
  } = $props();
</script>

<Modal bind:open {title}>
  <p class="text-sm text-[var(--text-2)]">{message}</p>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => { open = false; oncancel?.(); }}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} {loading} onclick={onconfirm}>Confirm</Button>
    </div>
  {/snippet}
</Modal>
