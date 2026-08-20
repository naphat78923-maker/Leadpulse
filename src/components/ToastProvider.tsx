'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success', action?: { label: string; onClick: () => void }) => {
    const id = String(++counter.current);
    setToasts(prev => [...prev, { id, message, type, action }]);
    timers.current[id] = setTimeout(() => removeToast(id), action ? 5000 : 2500);
  }, [removeToast]);

  // Clear timers on unmount.
  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-20 left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto mx-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up flex items-center gap-3 max-w-sm ${
              toast.type === 'success'
                ? 'bg-clay-success text-white'
                : 'bg-clay-error text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            )}
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick();
                  removeToast(toast.id);
                }}
                className="shrink-0 text-xs font-bold uppercase tracking-wide underline underline-offset-2 hover:opacity-80"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
