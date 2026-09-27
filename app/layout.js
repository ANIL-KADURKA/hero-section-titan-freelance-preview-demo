import { Libre_Baskerville, Inter } from 'next/font/google';
import './globals.css';

// Self-hosted by Next.js at build time — no external fetch to fonts.googleapis.com
// at runtime, so nothing blocks the first paint of the page's background color.
const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-libre-baskerville',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'Titan Freelance — Contract work, done right',
  description:
    'Titan Freelance is the layer between companies and freelancers. Companies post contracts, you apply to Titan, do the work and get paid.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${libreBaskerville.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
