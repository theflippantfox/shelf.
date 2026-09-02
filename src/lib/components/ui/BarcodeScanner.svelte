<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { BrowserMultiFormatReader } from '@zxing/browser';
  import {
    BarcodeFormat,
    DecodeHintType,
  } from '@zxing/library';
  import type { IScannerControls } from '@zxing/browser';
  import { X, Zap, ZapOff, CameraOff, ScanLine, Loader2 } from 'lucide-svelte';
  import Sheet from './Sheet.svelte';

  /**
   * BarcodeScanner — opens the rear camera, decodes a barcode, fires
   * onResult, and closes.  Wraps a Sheet modal so it inherits the
   * rest of the app's modal pattern.
   *
   * Why a single `lastCode` debounce: BrowserMultiFormatReader fires
   * its callback for every frame that decodes successfully, which on
   * a steady hold is up to 30Hz.  Without the dedupe, the cart would
   * receive the same product 30 times per second.
   *
   * Why manual input fallback: on a desktop without a camera, or on
   * a phone where the user denied camera permission, the scanner is
   * useless.  The manual field lets the user type a code and submit,
   * so the rest of the flow (lookup → add to cart) still works.
   *
   * Why stop the stream on every state change: getUserMedia() returns
   * a MediaStream that holds the camera hardware open.  Leaking the
   * stream is a real battery + privacy bug.  Stop on: open→false,
   * successful read, onDestroy, page navigation.
   */

  type Props = {
    open: boolean;
    onResult: (code: string) => void;
    onClose: () => void;
  };
  let { open, onResult, onClose }: Props = $props();

  let videoEl: HTMLVideoElement | null = $state(null);
  let controls: IScannerControls | null = null;
  let lastCode = '';
  let error: string | null = $state(null);
  let starting = $state(true);
  let torchOn = $state(false);
  let torchSupported = $state(false);
  let manualCode = $state('');

  const reader = new BrowserMultiFormatReader(
    new Map<DecodeHintType, any>([
      // Restrict the decoder to the formats a retail shop would
      // actually see.  Without this, the decoder tries every
      // format on every frame and burns battery.
      [DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
      ]],
      // Try harder — spend more CPU on each frame to read damaged
      // or low-contrast barcodes.  Worth it for a checkout flow.
      [DecodeHintType.TRY_HARDER, true],
    ]),
  );

  async function start() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      error = 'Camera not available in this browser';
      starting = false;
      return;
    }
    starting = true;
    error = null;
    try {
      controls = await reader.decodeFromVideoDevice(
        undefined,
        videoEl!,
        (result, _err, _controls) => {
          if (result) {
            const code = result.getText().trim();
            if (!code || code === lastCode) return;
            lastCode = code;
            // If the browser reports torch capability on the
            // current video track, enable the torch button.
            const stream = videoEl?.srcObject as MediaStream | null;
            const track = stream?.getVideoTracks?.()[0];
            if (track) {
              const caps = (track.getCapabilities?.() ?? {}) as any;
              torchSupported = !!('torch' in caps);
            }
            stop();
            onResult(code);
            onClose();
          }
          // _err is "NotFoundException" on every frame that doesn't
          // decode — expected, not an error worth showing.
        },
      );
      starting = false;
    } catch (e: any) {
      // NotAllowedError = user denied permission
      // NotFoundError = no camera on the device
      // NotReadableError = camera in use by another app
      const name = e?.name ?? '';
      if (name === 'NotAllowedError') {
        error = 'Camera access denied — type the barcode below';
      } else if (name === 'NotFoundError') {
        error = 'No camera found on this device';
      } else {
        error = e?.message ?? 'Could not start camera';
      }
      starting = false;
    }
  }

  function stop() {
    if (controls) {
      try { controls.stop(); } catch {}
      controls = null;
    }
    // Releasing the track explicitly is belt-and-braces — zxing
    // usually does this, but we want to be sure the camera LED
    // turns off when the user closes the modal.
    if (videoEl?.srcObject) {
      const stream = videoEl.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
  }

  // React to the `open` prop.  When it flips to true we start the
  // camera; when it flips to false we stop it.  Cleanup is in the
  // function returned from the effect.
  $effect(() => {
    if (open) {
      // Wait for the DOM to render the <video> element before asking
      // the reader to attach to it.
      queueMicrotask(() => {
        if (open && videoEl && !controls) start();
      });
    } else {
      stop();
    }
  });

  onMount(() => {
    // If the modal is already open on mount (shouldn't happen in
    // practice but defend against it), kick off the start.
    if (open && videoEl) start();
  });

  onDestroy(stop);

  async function toggleTorch() {
    if (!controls?.switchTorch) return;
    const next = !torchOn;
    try {
      await controls.switchTorch(next);
      torchOn = next;
    } catch {
      // Some browsers reject torch toggles with a constraint error
      // even when the capability is reported.  Just hide the toggle.
      torchSupported = false;
    }
  }

  function submitManual(e: Event) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    stop();
    onResult(code);
    onClose();
  }
</script>

<Sheet bind:open title="Scan barcode" maxWidth="max-w-md">
  <div class="relative aspect-[4/3] bg-[var(--inset)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--border)]">
    <!-- The video stream.  `playsinline` is required on iOS so the
         video plays inline rather than going fullscreen.  `muted` is
         required for autoplay to work without a user gesture. -->
    <video
      bind:this={videoEl}
      class="w-full h-full object-cover"
      muted
      playsinline
      autoplay
    ></video>

    <!-- Scan window: 80% wide, 30% tall, centered.  The `box-shadow`
         trick is the standard CSS pattern for a dim-everything-else
         overlay: a 9999px inset shadow is huge but contained by the
         rounded clip-path...  actually by the parent's
         `overflow: hidden`.  The visible result is a dim overlay
         with a clear scan window. -->
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      <div
        class="w-[78%] h-[34%] border-2 border-[var(--primary)] rounded-md relative"
        style="box-shadow: 0 0 0 9999px rgba(0,0,0,0.45);"
      >
        <!-- Corner brackets for a more scanner-y feel.  Inset from
             the border by 2px on each side so they sit just inside. -->
        <span class="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-[var(--primary)] rounded-tl-sm"></span>
        <span class="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-[var(--primary)] rounded-tr-sm"></span>
        <span class="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-[var(--primary)] rounded-bl-sm"></span>
        <span class="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-[var(--primary)] rounded-br-sm"></span>
      </div>
    </div>

    <!-- Top hint banner — only shows while scanning, hides when error
         or manual input is showing. -->
    {#if !error}
      <div class="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
        <div class="bg-[var(--surface)]/90 text-[var(--text-2)] text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[var(--border)] flex items-center gap-1.5">
          <ScanLine size={11} strokeWidth={2} />
          Point camera at a barcode
        </div>
      </div>
    {/if}

    {#if starting}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--inset)]/80">
        <Loader2 size={28} class="text-[var(--text-2)] animate-spin" />
        <p class="text-sm font-semibold text-[var(--text-2)]">Starting camera…</p>
      </div>
    {/if}

    {#if error}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-4 bg-[var(--inset)]/95">
        <CameraOff size={32} class="text-[var(--text-3)]" />
        <p class="text-sm font-semibold text-[var(--text)] text-center">{error}</p>
        <p class="text-xs text-[var(--text-3)] text-center max-w-[260px]">
          {#if error.includes('denied')}
            You can still type the barcode below.
          {:else}
            Use a device with a back camera, or type the code manually.
          {/if}
        </p>
      </div>
    {/if}
  </div>

  <!-- Manual input fallback — always visible at the bottom of the
       modal so it's available even when the camera works (a faster
       way to enter a known code on a desktop). -->
  <form onsubmit={submitManual} class="mt-3 flex gap-2">
    <input
      type="text"
      inputmode="numeric"
      bind:value={manualCode}
      placeholder="Or type a barcode…"
      class="input flex-1 font-mono text-sm"
      aria-label="Type barcode manually"
    />
    <button type="submit" class="btn btn-primary" disabled={!manualCode.trim()}>
      Add
    </button>
  </form>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      {#if torchSupported}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={toggleTorch}
          aria-label="Toggle torch"
        >
          {#if torchOn}
            <ZapOff size={14} /> Torch off
          {:else}
            <Zap size={14} /> Torch on
          {/if}
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => { stop(); onClose(); }}
      >
        <X size={14} /> Cancel
      </button>
    </div>
  {/snippet}
</Sheet>
