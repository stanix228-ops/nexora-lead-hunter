import clsx from 'clsx';

export function Card({
  children,
  className,
  title,
  subtitle,
  actions,
  padded = true,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx('rounded-xl border border-ink-100 bg-white shadow-card', className)}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    default: 'text-ink-900',
    brand: 'text-brand-600',
    success: 'text-success-600',
    warning: 'text-warning-500',
    danger: 'text-danger-500',
  };
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {icon && <div className="text-ink-300">{icon}</div>}
      </div>
      <p className={clsx('mt-2 text-2xl font-bold', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}