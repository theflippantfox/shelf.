/**
 * Shared HTML tooltip for chart.js.
 *
 * chart.js's caretX / caretY are pixel coordinates relative to the chart
 * canvas's own internal coordinate space, NOT the viewport. If we position
 * the tooltip using those values as `left:` / `top:` inside a relatively
 * positioned container, the tooltip:
 *   1. Clips against any ancestor with `overflow: hidden` (the chart card,
 *      the page-shell main, etc.) when the bar is near the right edge.
 *   2. Uses `transform: translate(-50%, -100%)` to centre on the caret
 *      which pushes half the tooltip off the right edge for the rightmost bar.
 *
 * Fix: render the tooltip with `position: fixed` and compute its coords
 * from the canvas's getBoundingClientRect() so it lives in viewport space
 * and can never be clipped. Then clamp it inside the viewport with a
 * margin so it can't overflow the right or bottom edge.
 *
 * The chart's "external" tooltip callback is a closure; we keep the
 * tooltip div in module-scope state per call. Each chart instance gets
 * its own helper via createChartTooltip().
 */

const VIEWPORT_MARGIN = 8; // px from the viewport edge

export type ChartTooltipPlacement = 'above' | 'below' | 'left' | 'right' | 'auto';

export interface ChartTooltipOptions {
  /** Canvas the chart is rendered into. Used to translate caret coords to viewport. */
  canvas: HTMLCanvasElement;
  /**
   * The chart.js tooltip's caret position. These are pixel coordinates
   * relative to the canvas's own coordinate space.
   */
  caretX: number;
  caretY: number;
  /**
   * Where to anchor the tooltip relative to the caret.
   *   'above' — tooltip sits above the caret (default for bar/line)
   *   'below' — tooltip sits below the caret
   *   'left'  — tooltip sits to the left of the caret (good for hbar)
   *   'right' — tooltip sits to the right of the caret
   *   'auto'  — pick based on the caret's position in the viewport
   */
  placement?: ChartTooltipPlacement;
}

export interface ChartTooltipHandle {
  /** Update the existing tooltip's position (e.g. on chart resize). */
  reposition(opts: ChartTooltipOptions): void;
  /** Remove the tooltip from the DOM. Safe to call multiple times. */
  destroy(): void;
  /** The tooltip's <div> element. Useful for tests. */
  el: HTMLDivElement;
}

/**
 * Mount a fixed-positioned tooltip at the given caret position.
 * Returns a handle to update / destroy it.
 */
export function mountChartTooltip(
  innerHTML: string,
  opts: ChartTooltipOptions,
): ChartTooltipHandle {
  const placement: ChartTooltipPlacement = opts.placement ?? 'above';

  const el = document.createElement('div');
  el.className = 'chart-tooltip';
  // Position: fixed, so ancestor overflow:hidden cannot clip us.
  // Visibility is hidden until we measure the first time, then visible
  // — prevents a one-frame flash at (0,0).
  el.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 9999;
    visibility: hidden;
    will-change: transform, left, top;
  `;
  el.innerHTML = innerHTML;
  document.body.appendChild(el);

  const apply = (options: ChartTooltipOptions) => {
    const rect = options.canvas.getBoundingClientRect();
    // caretX / caretY are in canvas-local pixel space; the canvas is
    // drawn with chart.js's internal DPI scaling, but the bounding
    // rect is in CSS pixels. Convert:
    const scaleX = rect.width  / options.canvas.width;
    const scaleY = rect.height / options.canvas.height;
    const viewportX = rect.left + options.caretX * scaleX;
    const viewportY = rect.top  + options.caretY * scaleY;

    // Measure the tooltip AFTER it's in the DOM (visibility: hidden is fine
    // for getBoundingClientRect).
    const tipW = el.offsetWidth;
    const tipH = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Resolve placement: for 'auto', pick based on which side has room.
    let p = options.placement ?? placement;
    if (p === 'auto') {
      const roomAbove = viewportY - tipH - VIEWPORT_MARGIN;
      const roomBelow = vh - viewportY - tipH - VIEWPORT_MARGIN;
      p = roomAbove >= roomBelow ? 'above' : 'below';
    }

    let left = viewportX;
    let top  = viewportY;
    switch (p) {
      case 'above': top -= tipH + 8; break;
      case 'below': top += 8;         break;
      case 'left':  left -= tipW + 8; break;
      case 'right': left += 8;         break;
    }

    // After placement shift, centre horizontally for above/below or
    // vertically for left/right.
    if (p === 'above' || p === 'below') {
      left -= tipW / 2;
    } else {
      top -= tipH / 2;
    }

    // Clamp inside the viewport. The key edge case: rightmost bar — the
    // tooltip centred on it will overflow the right edge. Clamp to
    // (vw - tipW - margin), and if clamping would push us past the
    // caret, instead position to the right of the caret (p = 'right').
    if (left + tipW > vw - VIEWPORT_MARGIN) {
      const overflow = (left + tipW) - (vw - VIEWPORT_MARGIN);
      // Try shifting left first.
      const shiftedLeft = left - overflow;
      if (shiftedLeft >= VIEWPORT_MARGIN && shiftedLeft + tipW / 2 >= viewportX - 4) {
        left = shiftedLeft;
      } else {
        // Flip: place the tooltip to the right of the caret.
        left = viewportX + 8;
        if (left + tipW > vw - VIEWPORT_MARGIN) {
          left = vw - VIEWPORT_MARGIN - tipW;
        }
        if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      }
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    // Vertical clamp.
    if (top + tipH > vh - VIEWPORT_MARGIN) {
      // If 'above' would push off the bottom, flip to 'below'.
      if (p === 'above') {
        top = viewportY + 8;
        if (top + tipH > vh - VIEWPORT_MARGIN) {
          top = vh - VIEWPORT_MARGIN - tipH;
        }
      } else {
        top = vh - VIEWPORT_MARGIN - tipH;
      }
    }
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
    el.style.visibility = 'visible';
  };

  apply(opts);

  return {
    el,
    reposition: apply,
    destroy() {
      el.remove();
    },
  };
}
