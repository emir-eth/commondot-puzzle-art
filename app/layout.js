import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Commondotxyz Puzzle Art",
  description:
    "commondotxyz static puzzle/mosaic art generator with Community Wall",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-white bg-gradient-to-b from-zinc-900 to-black">
        <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <span className="text-sm">🐄</span>
            </div>
            <div>
              <Link href="/" className="text-xl md:text-2xl font-semibold">
                Puzzle Art For Commondotxyz Community.
              </Link>
              <p className="text-sm text-zinc-400">
                puzzle view for commondotxyz community
              </p>
            </div>
          </div>

          {/* NAV: beyaz kapsül + ayraç */}
          <nav className="flex items-center gap-3 bg-white/10 rounded-full px-3 py-1 backdrop-blur-sm ring-1 ring-white/10">
            <Link
              href="/"
              className="px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 transition"
            >
              Generator
            </Link>

            {/* Dikey ayraç */}
            <span className="text-white/50 select-none">|</span>

            <Link
              href="/community"
              className="px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 transition"
            >
              Community Wall
            </Link>
          </nav>
        </header>

        {children}

        <footer className="w-full py-6 flex justify-center">
          <a
            href="https://x.com/emir_ethh"
            target="_blank"
            rel="noopener noreferrer"
            className="
              inline-flex items-center justify-center gap-2
              bg-white text-black rounded-full shadow-md
              px-10 md:px-14 py-3
              whitespace-nowrap
              min-w-[340px]
            "
          >
            <span className="text-sm">Powered by</span>

            {/* X logosu burada */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.33l-5.214-6.817-5.97 6.817H1.837l7.73-8.822L1.308 2.25h6.842l4.713 6.231 5.381-6.231z" />
            </svg>

            <span className="font-semibold">Emir.Eth</span>
          </a>
        </footer>
      </body>
    </html>
  );
}
