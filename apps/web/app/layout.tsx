import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vela — Form coaching that knows your body",
  description:
    "Real-time MediaPipe pose tracking, a deterministic biomechanics rules engine, and a Claude + Backboard coach that remembers your mobility, injuries, and lifting history. Built for the Big 3.",
  metadataBase: new URL("https://vela.local"),
  openGraph: {
    title: "Vela — Form coaching that knows your body",
    description:
      "Personalized squat, bench, and deadlift coaching powered by browser CV + a per-lifter knowledge graph.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-zinc-950 text-zinc-100 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
