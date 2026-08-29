'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, FullPage } from '@/components/ui/button';
import { Input } from '@/components/ui/form';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('admin@nexora.local');
  const [password, setPassword] = useState('NexoraDev123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FullPage>
      <div className="w-full max-w-sm px-4">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <MessagesSquare size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-900">Nexora WhatsApp Hub</h1>
          <p className="mt-1 text-sm text-ink-500">Войдите в свой рабочий кабинет</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Input label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          <Button type="submit" className="w-full" loading={busy} disabled={loading}>
            Войти
          </Button>
        </form>
        <p className="mt-4 text-center text-[11px] text-ink-400">
          Демо-доступ: admin@nexora.local / NexoraDev123!
        </p>
      </div>
    </FullPage>
  );
}