import type { Metadata } from "next";
import { Geist_Mono, Rajdhani } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Romus — Form coaching that knows your body",
  description:
    "Real-time MediaPipe pose tracking, a deterministic biomechanics rules engine, and a Claude + Backboard coach that remembers your mobility, injuries, and lifting history. Built for the Big 3.",
  metadataBase: new URL("https://romus.local"),
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Romus — Form coaching that knows your body",
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#ffffff",
          colorBackground: "#09090b", // zinc-950, matches body bg
          colorText: "#fafafa", // zinc-50
          colorInputBackground: "#18181b", // zinc-900
          colorInputText: "#fafafa",
        },
      }}
    >
      <html lang="en" className="dark">
        <body
          className={`${rajdhani.variable} ${geistMono.variable} bg-zinc-950 text-zinc-100 font-sans antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
