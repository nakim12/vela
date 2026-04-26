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

/**
 * Resolve a canonical site URL for `metadata.metadataBase`.
 *
 * Order of preference:
 *   1. `NEXT_PUBLIC_SITE_URL` — explicit override, useful when a custom
 *      domain is wired up in front of Vercel.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — set automatically by Vercel for
 *      production deployments and points at the canonical *.vercel.app
 *      alias rather than the per-deploy hash.
 *   3. `VERCEL_URL` — set automatically on every Vercel deploy, including
 *      previews. Falls back to the per-deploy hash so OG images on PR
 *      previews still resolve to that preview's domain.
 *   4. `http://localhost:3000` — local dev fallback. Never reached on
 *      Vercel.
 *
 * Server-only — `metadataBase` is consumed during the RSC pass, so plain
 * `process.env.*` reads are fine and don't need the `NEXT_PUBLIC_` prefix.
 */
function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export const metadata: Metadata = {
  title: "Vela — Form coaching that knows your body",
  description:
    "Real-time MediaPipe pose tracking, a deterministic biomechanics rules engine, and a Claude + Backboard coach that remembers your mobility, injuries, and lifting history. Built for the Big 3.",
  metadataBase: new URL(resolveSiteUrl()),
  icons: {
    icon: "/romus-logo.svg",
    shortcut: "/romus-logo.svg",
    apple: "/romus-logo.svg",
  },
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#ffffff",
          colorBackground: "#09090b",
          colorText: "#fafafa",
          colorNeutral: "#a1a1aa",
          colorInputBackground: "#09090b",
          colorInputText: "#fafafa",
          colorDanger: "#f87171",
          borderRadius: "0.75rem",
        },
        elements: {
          modalBackdrop: "!bg-black/80 backdrop-blur-sm",
          modalContent: "!mt-1 !shadow-none",
          cardBox: "!shadow-none",
          card: "!rounded-2xl !border !border-white/15 !bg-zinc-900/95 !shadow-2xl",
          headerTitle: "!text-zinc-50",
          headerSubtitle: "!text-zinc-400",
          formFieldLabel: "!text-zinc-300",
          formButtonPrimary:
            "!bg-white !text-black hover:!bg-zinc-200 !shadow-none",
          socialButtonsBlockButton:
            "!border !border-white/20 !bg-white/5 !text-zinc-100 hover:!bg-white/10",
          socialButtonsBlockButtonText: "!text-zinc-100",
          formFieldInput:
            "!border !border-white/15 !bg-zinc-900 !text-zinc-100 placeholder:!text-zinc-500 focus:!border-white/35 focus:!ring-0",
          dividerLine: "!bg-white/15",
          dividerText: "!text-zinc-500",
          footerActionText: "!text-zinc-400",
          footerActionLink: "!text-zinc-200 hover:!text-white",
          formFieldAction: "!text-zinc-300 hover:!text-white",
          formFieldErrorText: "!text-red-400",
          alert: "!border !border-red-400/30 !bg-red-500/10",
          alertText: "!text-red-300",
          identityPreviewText: "!text-zinc-200",
          identityPreviewEditButton: "!text-zinc-300 hover:!text-white",
          modalCloseButton:
            "!border !border-white/15 !bg-white/5 !text-zinc-200 hover:!bg-white/10 hover:!text-white",
          footer: "!bg-transparent",
          footerPages: "!hidden",
          userButtonPopoverCard:
            "!mt-1 !rounded-2xl !border !border-white/15 !bg-zinc-900/95 !shadow-2xl",
          userButtonPopoverMain: "!bg-transparent",
          userButtonPopoverMainIdentifier: "!text-zinc-100",
          userButtonPopoverMainIdentifierText: "!text-zinc-100",
          userPreviewMainIdentifier: "!text-zinc-100",
          userPreviewSecondaryIdentifier: "!text-zinc-300",
          userButtonPopoverActionButton:
            "!rounded-lg !text-zinc-200 hover:!bg-white/10 hover:!text-white",
          userButtonPopoverActionButtonText: "!text-zinc-200",
          userButtonPopoverFooter: "!hidden",
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
