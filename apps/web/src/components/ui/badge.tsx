import clsx from 'clsx';

type Tone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'violet'
  | 'pink';

const toneMap: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  pink: 'bg-pink-50 text-pink-600',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const leadStatusTone: Record<string, Tone> = {
  NEW: 'info',
  CONTACTED: 'brand',
  REPLIED: 'violet',
  INTERESTED: 'success',
  NEGOTIATION: 'warning',
  CLIENT: 'success',
  NO_RESPONSE: 'neutral',
};

export function LeadStatusBadge({ status }: { status: string }) {
  const ru: Record<string, string> = {
    NEW: 'Новый',
    CONTACTED: 'На связи',
    REPLIED: 'Ответили',
    INTERESTED: 'Заинтересован',
    NEGOTIATION: 'Переговоры',
    CLIENT: 'Клиент',
    NO_RESPONSE: 'Нет ответа',
  };
  return <Badge tone={leadStatusTone[status] ?? 'neutral'}>{ru[status] ?? status}</Badge>;
}

const accountStatusTone: Record<string, Tone> = {
  ONLINE: 'success',
  OFFLINE: 'neutral',
  PAUSED: 'warning',
  ATTENTION: 'danger',
};

export function AccountStatusBadge({ status }: { status: string }) {
  const ru: Record<string, string> = {
    ONLINE: 'Онлайн',
    OFFLINE: 'Офлайн',
    PAUSED: 'На паузе',
    ATTENTION: 'Внимание',
  };
  return <Badge tone={accountStatusTone[status] ?? 'neutral'}>{ru[status] ?? status}</Badge>;
}

const riskTone: Record<string, Tone> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export function RiskBadge({ level }: { level: string }) {
  const ru: Record<string, string> = {
    LOW: 'Низкий',
    MEDIUM: 'Средний',
    HIGH: 'Высокий',
    CRITICAL: 'Критический',
  };
  return (
    <Badge tone={riskTone[level] ?? 'neutral'} className={level === 'CRITICAL' ? 'animate-pulse' : ''}>
      {ru[level] ?? level}
    </Badge>
  );
}

const campaignStatusTone: Record<string, Tone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'brand',
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const ru: Record<string, string> = {
    DRAFT: 'Черновик',
    ACTIVE: 'Активна',
    PAUSED: 'Пауза',
    COMPLETED: 'Завершена',
  };
  return <Badge tone={campaignStatusTone[status] ?? 'neutral'}>{ru[status] ?? status}</Badge>;
}

export function sourceRu(source?: string | null): string {
  const map: Record<string, string> = {
    WA_LINK: 'WhatsApp-ссылка',
    PHONE: 'Телефон',
    INSTAGRAM: 'Instagram',
    WEBSITE: 'Сайт',
    CSV: 'CSV',
    MANUAL: 'Вручную',
  };
  return map[source ?? ''] ?? source ?? '—';
}

export function statusRu(status?: string | null): string {
  const map: Record<string, string> = {
    NEW: 'Новый',
    CONTACTED: 'На связи',
    REPLIED: 'Ответили',
    INTERESTED: 'Заинтересован',
    NEGOTIATION: 'Переговоры',
    CLIENT: 'Клиент',
    NO_RESPONSE: 'Нет ответа',
  };
  return map[status ?? ''] ?? status ?? '—';
}