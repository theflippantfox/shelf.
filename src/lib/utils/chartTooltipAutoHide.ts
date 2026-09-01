/**
 * Shared auto-hide behaviour for chart.js custom HTML tooltips.
 *
 * chart.js's `external` tooltip callback is only invoked on hover/move
 * events. If the user scrolls the page while hovering (or the chart
 * scrolls out of the viewport), the tooltip element stays stuck on
 * screen at its last caret position. This module wires up the three
 * listeners needed to keep the tooltip in sync with the rest of the UI.
 *
 * Returned disposer removes every listener it added.
 */
export function setupTooltipAutoHide(
  canvas: HTMLCanvasElement,
  hide: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  // 1) Any scroll anywhere — destroy the tooltip. Capture phase so we
  //    catch scrolls on any ancestor (e.g. the page-shell <main>).
  const onScroll = () => hide();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('wheel', onScroll, true);
  window.addEventListener('touchmove', onScroll, true);

  // 2) Cursor leaves the chart's bounding rect. chart.js does set
  //    opacity=0 on mouseout, but pointer/touch events occasionally
  //    skip the external callback, so this is a belt-and-braces
  //    fallback that fires on every mousemove.
  const onMouseMove = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    if (
      e.clientX < r.left  || e.clientX > r.right ||
      e.clientY < r.top   || e.clientY > r.bottom
    ) {
      hide();
    }
  };
  document.addEventListener('mousemove', onMouseMove);

  // 3) IntersectionObserver fires once when the canvas enters/leaves
  //    the viewport. Cheap (no per-frame checks) and works for fast
  //    scrolls, anchor jumps, route changes, and tab switches.
  let intersection: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) hide();
        }
      },
      { threshold: 0 },
    );
    intersection.observe(canvas);
  }

  // 4) SvelteKit client-side navigations: when the page transitions,
  //    the layout will be replaced and the chart unmounts, but in
  //    the brief moment before unmount a stale tooltip can flash.
  //    pagehide/beforeunload covers tab closes too.
  const onPageHide = () => hide();
  window.addEventListener('pagehide', onPageHide);

  return () => {
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('wheel', onScroll, true);
    window.removeEventListener('touchmove', onScroll, true);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('pagehide', onPageHide);
    intersection?.disconnect();
  };
}
