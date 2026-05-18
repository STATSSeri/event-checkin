import type { Metadata } from 'next';
import { Instrument_Serif, Noto_Sans_JP, Inter, Jost } from 'next/font/google';
import './globals.css';

// S/PASS Design System: LPと同じフォントセット
const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

const notoSansJP = Noto_Sans_JP({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jp',
});

const inter = Inter({
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

// サービス wordmark "S/PASS" 用フォント（Futura 代替 = Jost Medium 600）
// STATSデザインシステム準拠。`var(--font-mark)` 参照箇所で利用される
const jost = Jost({
  weight: ['500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mark',
});

export const metadata: Metadata = {
  title: 'イベント受付管理',
  description: 'イベント受付・出欠管理・QRチェックインシステム',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ja"
      className={`${instrumentSerif.variable} ${notoSansJP.variable} ${inter.variable} ${jost.variable}`}
    >
      <body className="bg-cream min-h-screen">{children}</body>
    </html>
  );
}
