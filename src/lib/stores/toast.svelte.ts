export interface Toast {
  id:       string;
  message:  string;
  variant:  'success' | 'error' | 'warning' | 'info';
  duration: number;
}

let _toasts = $state<Toast[]>([]);

function add(message: string, variant: Toast['variant'] = 'info', duration?: number) {
  const d = duration ?? (variant === 'error' ? 5000 : 3500);
  const id = crypto.randomUUID();
  _toasts = [..._toasts, { id, message, variant, duration: d }];
  setTimeout(() => dismiss(id), d);
}

function dismiss(id: string) {
  _toasts = _toasts.filter(t => t.id !== id);
}

export const toasts = {
  get items() { return _toasts; },
  add,
  dismiss,
  success: (msg: string, dur?: number) => add(msg, 'success', dur),
  error:   (msg: string, dur?: number) => add(msg, 'error',   dur),
  warning: (msg: string, dur?: number) => add(msg, 'warning', dur),
  info:    (msg: string, dur?: number) => add(msg, 'info',    dur),
};
