import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Nexora — WhatsApp CRM & Лид-парсер',
  description: 'Центр управления WhatsApp аккаунтами, сбором лидов с 2ГИС / Google Maps и диалогами.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="bg-slate-50 text-slate-900 font-sans min-h-screen antialiased">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}