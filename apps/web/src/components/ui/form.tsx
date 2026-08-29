import clsx from 'clsx';

export function Input({
  label,
  className,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>}
      <input
        className={clsx(
          'h-9 w-full rounded-lg border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors',
          error ? 'border-danger-400' : 'border-ink-200',
          className,
        )}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-danger-500">{error}</span>}
    </label>
  );
}

export function Select({
  label,
  className,
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>}
      <select
        className={clsx(
          'h-9 w-full rounded-lg border bg-white px-2.5 text-sm text-ink-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors',
          error ? 'border-danger-400' : 'border-ink-200',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-danger-500">{error}</span>}
    </label>
  );
}

export function Textarea({
  label,
  className,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>}
      <textarea
        className={clsx(
          'w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors',
          error ? 'border-danger-400' : 'border-ink-200',
          className,
        )}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-danger-500">{error}</span>}
    </label>
  );
}