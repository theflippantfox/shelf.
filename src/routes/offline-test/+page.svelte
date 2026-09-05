<script lang="ts">
  /**
   * /offline-test — a temporary debug page that exercises the
   * offline-fetch queue without needing DevTools. Renders the
   * queue contents, lets you enqueue a fake sale, and exposes
   * the manual sync trigger.
   */
  import { offlineFetch } from '$lib/offline/offlineFetch';
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import { getDb, type PendingOp } from '$lib/offline/offlineDb';
  import Button from '$lib/components/ui/Button.svelte';

  let queue: PendingOp[] = $state([]);
  let lastResult: string = $state('');

  async function refresh() {
    const db = await getDb();
    queue = await db.getAllFromIndex('pending_ops', 'by-created');
  }
  $effect(() => {
    void offlineSync.pendingCount; // re-run when this changes
    void refresh();
  });

  async function enqueueTestOp() {
    try {
      const res = await offlineFetch('/api/categories', {
        method: 'POST',
        kind: 'other',
        body: { name: '__test_op__', color: 'red', icon: 'Box' },
      });
      lastResult = `status=${res.status} body=${await res.text()}`;
      await refresh();
    } catch (e: any) {
      lastResult = `error: ${e?.message ?? e}`;
    }
  }

  async function clearQueue() {
    const db = await getDb();
    const tx = db.transaction('pending_ops', 'readwrite');
    for (const op of queue) await tx.store.delete(op.id);
    await tx.done;
    await refresh();
  }
</script>

<div class="p-6 max-w-2xl mx-auto space-y-4">
  <h1 class="text-2xl font-bold">Offline test harness</h1>
  <p class="text-sm text-[var(--text-2)]">
    Online: <strong>{offlineSync.online ? 'yes' : 'no'}</strong>.
    Pending ops: <strong>{offlineSync.pendingCount}</strong>.
    Last error: <code class="text-xs">{offlineSync.lastError ?? 'none'}</code>
  </p>

  <div class="flex gap-2">
    <Button onclick={enqueueTestOp}>Enqueue test op (POST /api/categories)</Button>
    <Button variant="secondary" onclick={() => offlineSync.syncNow()}>Sync now</Button>
    <Button variant="secondary" onclick={clearQueue}>Clear queue</Button>
  </div>

  {#if lastResult}
    <p class="text-xs font-mono p-2 rounded bg-[var(--surface2)]">{lastResult}</p>
  {/if}

  <h2 class="text-lg font-semibold mt-6">Queue contents ({queue.length})</h2>
  <ul class="space-y-1.5">
    {#each queue as op (op.id)}
      <li class="text-xs font-mono p-2 rounded bg-[var(--surface)]">
        <div><span class="text-[var(--text-3)]">{op.method}</span> {op.path}</div>
        <div class="text-[var(--text-3)]">
          kind={op.kind} · attempts={op.attempts} · next={op.next_retry_at ? new Date(op.next_retry_at).toLocaleTimeString() : 'ready'}
          {#if op.last_error}· <span class="text-[var(--crimson)]">{op.last_error}</span>{/if}
          {#if op.permanent}· <span class="text-[var(--crimson)]">permanent</span>{/if}
        </div>
      </li>
    {/each}
  </ul>
</div>
