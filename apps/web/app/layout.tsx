import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vampless — One name. One ticker. One registry.",
  description:
    "Vampless is a shared token identity registry and launch authorization protocol for Solana. Launchpads reserve a token's name, ticker and image before launch, so the same identity cannot be registered twice anywhere in the network.",
  metadataBase: new URL("https://vampless.xyz"),
  openGraph: {
    title: "Vampless — shared token identity registry",
    description: "A reservation made on one launchpad is honored on every other. Preflight, attest, commit, register — atomically.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="grain min-h-full flex flex-col">
        <Nav />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
