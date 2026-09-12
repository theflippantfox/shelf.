<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { X, Zap, ZapOff, CameraOff, ScanLine, Loader2 } from 'lucide-svelte';
  import Sheet from './Sheet.svelte';

  /**
   * BarcodeScanner — opens the rear camera, decodes a barcode, fires
   * onResult, and closes.  Uses the native BarcodeDetector API
   * (Chrome 83+, Safari 17+, Edge 83+) with a zxing fallback for
   * older browsers.
   *
   * Performance:
   *   - Native BarcodeDetector uses hardware acceleration — typically
   *     decodes in <100ms vs zxing's 1-10 seconds.
   *   - Format hints narrow the decoder to retail barcode types.
   *   - Scan throttle at 150ms prevents duplicate reads.
   *
   * Why manual input fallback: on a desktop without a camera, or on a
   * phone where the user denied camera permission, the scanner is
   * useless. The manual field lets the user type a code and submit.
   */

  type Props = {
    open: boolean;
    onResult: (code: string) => void;
    onClose: () => void;
  };
  let { open, onResult, onClose }: Props = $props();

  let videoEl: HTMLVideoElement | null = $state(null);
  let stream: MediaStream | null = null;
  let lastCode = '';
  let error: string | null = $state(null);
  let starting = $state(true);
  let torchOn = $state(false);
  let torchSupported = $state(false);
  let manualCode = $state('');
  let lastScanTime = 0;
  const SCAN_INTERVAL = 120; // ms between scan attempts

  // Native BarcodeDetector instance (when available)
  let detector: any = null;
  let detectorReady = false;

  // zxing fallback instances
  let zxingReader: any = null;
  let zxingControls: any = null;

  // ── Native BarcodeDetector ────────────────────────────────────────
  const BARCODE_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'qr_code',
  ];

  async function initNativeDetector(): Promise<boolean> {
    if (typeof (window as any).BarcodeDetector === 'undefined') return false;
    try {
      const supported = await (window as any).BarcodeDetector.getSupportedFormats();
      const formats = BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return false;
      detector = new (window as any).BarcodeDetector({ formats });
      detectorReady = true;
      return true;
    } catch {
      return false;
    }
  }

  // ── zxing fallback ────────────────────────────────────────────────
  async function initZxing(): Promise<boolean> {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
      ]);
      zxingReader = new BrowserMultiFormatReader(hints);
      return true;
    } catch {
      return false;
    }
  }

  // ── Camera stream ─────────────────────────────────────────────────
  async function startCamera(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      error = 'Camera not available in this browser';
      starting = false;
      return false;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!videoEl) {
        error = 'Video element not found';
        starting = false;
        return false;
      }

      videoEl.srcObject = stream;
      await videoEl.play();

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = (track.getCapabilities?.() ?? {}) as any;
        torchSupported = !!('torch' in caps);
      }

      return true;
    } catch (e: any) {
      const name = e?.name ?? '';
      if (name === 'NotAllowedError') {
        error = 'Camera access denied — type the barcode below';
      } else if (name === 'NotFoundError') {
        error = 'No camera found on this device';
      } else {
        error = e?.message ?? 'Could not start camera';
      }
      starting = false;
      return false;
    }
  }

  // ── Scan loop ─────────────────────────────────────────────────────
  let scanFrameId: number | null = null;

  function scanLoop() {
    if (!open || (!detectorReady && !zxingReader)) return;

    const now = Date.now();
    if (now - lastScanTime < SCAN_INTERVAL) {
      scanFrameId = requestAnimationFrame(scanLoop);
      return;
    }
    lastScanTime = now;

    if (detectorReady && videoEl) {
      // Native BarcodeDetector — hardware accelerated
      detector.detect(videoEl).then((barcodes: any[]) => {
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue?.trim();
          if (code && code !== lastCode) {
            lastCode = code;
            handleResult(code);
            return;
          }
        }
        scanFrameId = requestAnimationFrame(scanLoop);
      }).catch(() => {
        scanFrameId = requestAnimationFrame(scanLoop);
      });
    } else {
      scanFrameId = requestAnimationFrame(scanLoop);
    }
  }

  // zxing callback-based decoding (only used as fallback)
  function startZxingDecode() {
    if (!zxingReader || !videoEl) return;

    zxingControls = zxingReader.decodeFromVideoElement(
      videoEl,
      (result: any, _err: any) => {
        const now = Date.now();
        if (now - lastScanTime < SCAN_INTERVAL) return;
        lastScanTime = now;

        if (result) {
          const code = result.getText().trim();
          if (code && code !== lastCode) {
            lastCode = code;
            handleResult(code);
          }
        }
      },
    );
  }

  function handleResult(code: string) {
    stop();
    onResult(code);
    onClose();
  }

  // ── Start / Stop ──────────────────────────────────────────────────
  async function start() {
    starting = true;
    error = null;

    const cameraReady = await startCamera();
    if (!cameraReady) return;

    // Try native BarcodeDetector first (10-100x faster)
    if (await initNativeDetector()) {
      starting = false;
      scanFrameId = requestAnimationFrame(scanLoop);
      return;
    }

    // Fall back to zxing
    if (await initZxing()) {
      starting = false;
      startZxingDecode();
      return;
    }

    error = 'No barcode decoder available';
    starting = false;
  }

  function stop() {
    if (scanFrameId != null) {
      cancelAnimationFrame(scanFrameId);
      scanFrameId = null;
    }
    if (zxingControls) {
      try { zxingControls.stop(); } catch {}
      zxingControls = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
    detector = null;
    detectorReady = false;
    zxingReader = null;
  }

  $effect(() => {
    if (open) {
      queueMicrotask(() => {
        if (open && videoEl) start();
      });
    } else {
      stop();
    }
  });

  onDestroy(stop);

  async function toggleTorch() {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      torchOn = next;
    } catch {
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
    <video
      bind:this={videoEl}
      class="w-full h-full object-cover"
      muted
      playsinline
      autoplay
    ></video>

    <!-- Scan window overlay -->
    <div
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      <div
        class="w-[78%] h-[34%] border-2 border-[var(--primary)] rounded-md relative"
        style="box-shadow: 0 0 0 9999px rgba(0,0,0,0.45);"
      >
        <span class="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-[var(--primary)] rounded-tl-sm"></span>
        <span class="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-[var(--primary)] rounded-tr-sm"></span>
        <span class="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-[var(--primary)] rounded-bl-sm"></span>
        <span class="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-[var(--primary)] rounded-br-sm"></span>
      </div>
    </div>

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
