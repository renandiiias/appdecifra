import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import ThemeToggle from '@/components/ThemeToggle';
import AuthStatus from '@/components/AuthStatus';

export const metadata: Metadata = {
  title: 'Cifra Cristã',
  description: 'Plataforma de cifras cristãs com experiência limpa e sem anúncios.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header>
          <div className="navbar">
            <div className="navbar-left">
              <Link href="/" className="brand">
                <span className="brand-logo">C</span>
                <span className="brand-word">
                  Cifra&nbsp;<span>Cristã</span>
                </span>
              </Link>
            </div>
            <form className="search-form" action="/musicas">
              <input className="search-input" name="q" placeholder="O que você quer tocar hoje?" />
              <button className="search-button" type="submit">Buscar</button>
            </form>
            <div className="navbar-right">
              <nav className="nav-links">
                <Link href="/musicas">Músicas</Link>
                <Link href="/afinador">Afinador</Link>
                <Link href="/enviar-cifra">Enviar cifra</Link>
                <Link href="/artistas">Artistas</Link>
              </nav>
              <div className="nav-actions">
                <ThemeToggle />
                <AuthStatus />
              </div>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
