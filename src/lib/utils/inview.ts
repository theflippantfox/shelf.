/**
 * Svelte action: track whether an element is inside (or near) the viewport.
 *
 * Usage:
 *   <div use:inview={onEnter}></div>
 *   <div use:inview={{ onEnter, rootMargin: '600px' }}></div>
 *
 * The callback fires `onEnter(true)` when the element first intersects and
 * `onEnter(false)` when it leaves. Designed for virtualised card grids where
 * the observer is attached to a fixed-height placeholder and the callback
 * mounts/unmounts the real card above it.
 *
 * One IntersectionObserver per element — cheap to create, clean teardown.
 */
import type { Action } from 'svelte/action';

type InviewCallback = (visible: boolean) => void;

interface InviewOptions {
  onEnter: InviewCallback;
  /** CSS-style rootMargin; defaults to '400px 0px' (vertical buffer). */
  rootMargin?: string;
  /** Optional explicit root; defaults to viewport. */
  root?: Element | Document | null;
}

export const inview: Action<HTMLElement, InviewOptions | InviewCallback> = (node, params) => {
  let cb: InviewCallback;
  let rootMargin = '400px 0px';
  let root: Element | Document | null = null;

  if (typeof params === 'function') {
    cb = params;
  } else {
    cb = params.onEnter;
    rootMargin = params.rootMargin ?? rootMargin;
    root = params.root ?? null;
  }

  let observer: IntersectionObserver | null = null;
  let fallback = true;

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          cb(entry.isIntersecting);
        }
      },
      { rootMargin, root, threshold: 0 },
    );
    observer.observe(node);
    fallback = false;
  }

  // No IntersectionObserver support → assume visible so we always render.
  if (fallback) cb(true);

  return {
    destroy() {
      observer?.disconnect();
    },
  };
};