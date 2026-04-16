import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'イベント受付管理',
  description: 'イベント受付・出欠管理・QRチェックインシステム',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
