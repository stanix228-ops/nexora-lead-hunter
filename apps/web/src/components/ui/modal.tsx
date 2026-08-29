'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'lg',
  className,
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    full: 'max-w-[95vw]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-ink-900/60 backdrop-blur-xs" onClick={onClose} />
      <div
        className={clsx(
          'relative w-full rounded-2xl bg-white p-6 shadow-2xl transition-all border border-ink-100',
          maxWidthClasses[maxWidth],
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-ink-100 pb-4 mb-4">
            <div className="font-bold text-lg text-ink-900">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div>{children}</div>
        {footer && <div className="mt-4 pt-4 border-t border-ink-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title = 'Подтвердите действие',
  message,
  confirmText = 'Удалить',
  cancelText = 'Отмена',
  busy = false,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="sm">
      <div className="space-y-4">
        {message && <p className="text-sm text-ink-600">{message}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="md" onClick={onConfirm} loading={busy}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
