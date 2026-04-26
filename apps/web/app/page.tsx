import Link from "next/link";
import Image from "next/image";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  Brain,
  Camera,
  Mic,
  Radio,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.94 3.2 9.13 7.64 10.61.56.1.77-.24.77-.54v-2.1c-3.11.68-3.77-1.34-3.77-1.34-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.49-.28-5.11-1.25-5.11-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.97 0 0 .94-.3 3.08 1.15.89-.25 1.85-.37 2.8-.38.95.01 1.91.13 2.8.38 2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.69.11 2.97.72.79 1.16 1.79 1.16 3.02 0 4.31-2.63 5.27-5.13 5.54.4.34.76 1.02.76 2.06v3.06c0 .3.21.65.78.54 4.43-1.49 7.62-5.67 7.62-10.61C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}

import NeuralBackground from "@/components/ui/flow-field-background";

const navLinks = [
  { href: "#fix-one-rep", label: "Fix One Rep" },
  { href: "#workflow", label: "Workflow" },
  { href: "#lifts", label: "The Big 3" },
  { href: "#personalization", label: "Personalization" },
] as const;

const stats = [
  { value: "<200 ms", label: "risk cue latency from frame to cue" },
  { value: "30 fps", label: "on-device pose tracking in-browser" },
  { value: "13", label: "form faults across squat, bench, deadlift" },
  { value: "1", label: "persistent coach memory per lifter" },
] as const;

const steps = [
  {
    n: "01",
    title: "Capture",
    body: "Start a live set or upload a clip. Pose tracking runs in-browser with no frame streaming to a server.",
    icon: Camera,
  },
  {
    n: "02",
    title: "Analyze",
    body: "Rules engine scores knee cave, bar drift, asymmetry, and trunk position on the same frame you see.",
    icon: Activity,
  },
  {
    n: "03",
    title: "Cue",
    body: "High-risk faults trigger short in-set coaching cues immediately, before your next rep compounds the mistake.",
    icon: Brain,
  },
  {
    n: "04",
    title: "Improve",
    body: "After the set, you get a debrief with next-set priorities and trendlines against your recent sessions.",
    icon: Mic,
  },
] as const;

const channels = [
  {
    title: "Live skeleton overlay",
    body: "Joints draw on top of your video at 30 fps. Color-coded by severity — green clean, yellow warn, red stop.",
    icon: Radio,
    chip: "in-frame",
  },
  {
    title: "In-set voice cue",
    body: "3 to 8 words. Coaches don't lecture mid-set. Cue queue debounces so you never get yelled at twice for the same thing.",
    icon: Volume2,
    chip: "<200 ms",
  },
  {
    title: "Post-set debrief",
    body: "Risk timeline, personalized cues with biomech citations, long-term trend charts, and a transparent log of what we learned about you.",
    icon: Sparkles,
    chip: "post-rack",
  },
] as const;

const lifts = [
  {
    name: "Squat",
    rules: [
      "Knee cave on ascent",
      "Butt wink vs personal baseline",
      "Depth asymmetry L/R",
      "Forward dump (chest collapse)",
      "Heel lift",
    ],
  },
  {
    name: "Bench",
    rules: [
      "Shoulder flare at chest",
      "Bar path drift across reps",
      "Uneven press lockout",
      "Wrist break under load",
    ],
  },
  {
    name: "Deadlift",
    rules: [
      "Round back at liftoff",
      "Hip rises before shoulders",
      "Bar drift forward of mid-foot",
      "Lockout hyperextension",
    ],
  },
] as const;

const freshAccountCues = [
  "Knees out — keep them tracking over your toes.",
  "Stop and reset, your back is rounding at the bottom.",
  "Stay more upright, you're dumping forward.",
];

const knownLifterCues = [
  "Drive through your right heel — left side is taking over again.",
  "Cleared depth, stop chasing more — your PT noted this.",
  "Brace ribs down — internal cue, like we said works for you.",
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-zinc-100 selection:bg-white/20 selection:text-white">
      <SiteNav />
      <Hero />
      <StatsStrip />
      <FixOneRep />
      <HowItWorks />
      <BigThree />
      <FeedbackChannels />
      <Personalization />
      <Architecture />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group relative inline-flex h-0 w-[140px] overflow-visible">
          <span className="absolute top-1/2 inline-block h-8 w-[140px] -translate-y-1/2 overflow-hidden">
            <Image
              src="/logo.png"
              alt="Romus logo"
              width={140}
              height={44}
              className="-translate-y-[28%] h-auto w-[140px] max-w-none invert"
              priority
            />
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="transition hover:text-zinc-100"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com"
            className="hidden size-8 place-items-center rounded-md border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100 sm:grid"
            aria-label="GitHub"
          >
            <GithubMark className="size-4" />
          </a>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:text-zinc-100 sm:inline-flex">
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Link
            href="/lift/squat"
            className="group inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            Try the demo
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Link>
          <Show when="signed-in">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-8",
                },
              }}
            />
          </Show>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate">
      <div className="pointer-events-none absolute inset-0">
        <NeuralBackground
          color="#d4d4d8"
          trailOpacity={0.1}
          particleCount={520}
          speed={0.7}
        />
      </div>
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-28 text-center lg:pt-32 lg:pb-36">
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
            <span className="size-1.5 rounded-full bg-white" />
            Built for Backboard × Claude
          </div>
          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Train harder with{" "}
            <span className="text-white">
              fewer bad reps
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            Real-time lift feedback for squat, bench, and deadlift. Romus flags
            risky mechanics mid-set and gives you personalized cues you can use
            on the very next rep.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/lift/squat"
              className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Try the squat demo
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/10"
            >
              Upload a video
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 px-2 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
            >
              Set up your lifter profile
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-zinc-300" /> Pose runs
              entirely on-device
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-zinc-300" /> Memory is
              yours, exportable, deletable
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsStrip() {
  return (
    <section className="border-y border-white/5 bg-white/[0.02]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-y divide-white/5 px-6 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-6 first:pl-0 last:pr-0 sm:py-8">
            <div className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
              {s.value}
            </div>
            <div className="mt-1 text-xs text-zinc-500 sm:text-sm">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FixOneRep() {
  return (
    <section id="fix-one-rep" className="relative px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Fix one rep now
        </p>
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Don&apos;t rebuild your whole program. Fix the exact rep that breaks down.
        </h2>
        <p className="mt-5 text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
          Iris-style workflow, but built for lifting: isolate the moment your
          mechanics fail, diagnose it in context, and carry the correction into
          your next set without guesswork.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/lift/squat"
            className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            Fix a squat rep live
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/10"
          >
            Upload one failed set
          </Link>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="workflow" className="relative px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Workflow"
          title="Capture. Analyze. Cue. Improve."
          subtitle="One clear loop for every set: read the rep, flag the fault, deliver the cue, track what changed next session."
        />
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ n, title, body, icon: Icon }) => (
            <div
              key={n}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 transition hover:border-white/20 hover:from-white/[0.07]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-500">{n}</span>
                <span className="grid size-8 place-items-center rounded-md border border-white/10 bg-white/5 text-white">
                  <Icon className="size-4" />
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-zinc-50">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {body}
              </p>
              <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeedbackChannels() {
  return (
    <section
      id="feedback"
      className="relative border-y border-white/5 bg-white/[0.015] px-6 py-24 sm:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Three feedback channels"
          title="In the moment, after the set, across the season."
          subtitle="Most form apps pick one channel. We deliver all three because each one fixes a different category of mistake."
        />
        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {channels.map(({ title, body, icon: Icon, chip }) => (
            <div
              key={title}
              className="relative flex flex-col rounded-xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-md border border-white/20 bg-white/10 text-white">
                  <Icon className="size-4" />
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  {chip}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-zinc-50">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Personalization() {
  return (
    <section id="personalization" className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Personalization is the point"
          title="Same rep. Different lifter. Different cue."
          subtitle="Your assistant remembers across sessions. Mobility limits, injury history, anthropometry, even which cue style works for you. Watch the same butt wink that flagged on a fresh account get personalized away on yours."
        />

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CueCard
            label="Fresh account"
            sublabel="population defaults · no memory"
            cues={freshAccountCues}
            tone="muted"
          />
          <CueCard
            label="Your account"
            sublabel="grounded in your knowledge graph"
            cues={knownLifterCues}
            tone="accent"
          />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 p-6 sm:grid-cols-3">
          <KGFact
            category="Mobility"
            fact="Ankle dorsiflexion limited to 28° R, 34° L (measured 2026-04-12)."
          />
          <KGFact
            category="Injury"
            fact="Right SI joint flare 2026-02. Trigger: high-bar squat below parallel under fatigue."
          />
          <KGFact
            category="Cue preference"
            fact="Responds better to internal cues (&ldquo;brace ribs down&rdquo;) than external."
          />
        </div>
      </div>
    </section>
  );
}

function CueCard({
  label,
  sublabel,
  cues,
  tone,
}: {
  label: string;
  sublabel: string;
  cues: string[];
  tone: "muted" | "accent";
}) {
  const accent = tone === "accent";
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border p-6 " +
        (accent
          ? "border-white/30 bg-gradient-to-br from-white/[0.06] to-zinc-500/[0.05]"
          : "border-white/10 bg-white/[0.02]")
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p
            className={
              "text-sm font-semibold " +
              (accent ? "text-white" : "text-zinc-200")
            }
          >
            {label}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{sublabel}</p>
        </div>
        <span
          className={
            "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " +
            (accent
              ? "border border-white/40 bg-white/10 text-white"
              : "border border-white/10 bg-white/5 text-zinc-400")
          }
        >
          {accent ? "personalized" : "generic"}
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {cues.map((c, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-lg border border-white/5 bg-zinc-950/40 p-3 text-sm text-zinc-200"
          >
            <span
              className={
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md " +
                (accent
                  ? "bg-white/20 text-white"
                  : "bg-white/10 text-zinc-400")
              }
            >
              <Volume2 className="size-3" />
            </span>
            <span>&ldquo;{c}&rdquo;</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KGFact({ category, fact }: { category: string; fact: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/50 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-300">
        {category}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{fact}</p>
    </div>
  );
}

function BigThree() {
  return (
    <section
      id="lifts"
      className="relative border-t border-white/5 bg-white/[0.015] px-6 py-24 sm:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="The Big 3"
          title="Rules tuned for the lifts that matter."
          subtitle="Each lift gets a dedicated segmenter and rule set. Population defaults out of the box; your assistant overrides them when it has reason."
        />
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {lifts.map((lift) => (
            <div
              key={lift.name}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 p-6 transition hover:border-white/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold tracking-tight text-zinc-50">
                  {lift.name}
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {lift.rules.length} rules
                </span>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-zinc-400">
                {lift.rules.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-300" />
                    {r}
                  </li>
                ))}
              </ul>
              <Link
                href={`/lift/${lift.name.toLowerCase()}`}
                className="mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-200 transition hover:text-white"
              >
                Try {lift.name.toLowerCase()} live
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section id="architecture" className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Architecture"
          title="On-device where speed matters. On the server where memory does."
          subtitle="If Backboard hiccups, the rules engine and overlay still work. The agent layer is enhancement, not dependency."
        />
        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ArchPanel
            tag="Browser · Next.js"
            title="Real-time, low-latency"
            items={[
              "MediaPipe Pose Landmarker (WASM + WebGL)",
              "Rep segmenter per lift",
              "Deterministic rules engine",
              "Canvas skeleton overlay",
              "Web Speech cue queue",
            ]}
          />
          <ArchPanel
            tag="Server · FastAPI + Backboard"
            title="Memory, reasoning, persistence"
            items={[
              "Per-user Backboard assistant",
              "Claude Sonnet 4.5 via Backboard",
              "6 tools: query / log / threshold / RAG / summary / load",
              "Postgres for sets, reps, events",
              "Object storage for raw landmark Parquet",
            ]}
            accent
          />
        </div>
      </div>
    </section>
  );
}

function ArchPanel({
  tag,
  title,
  items,
  accent,
}: {
  tag: string;
  title: string;
  items: string[];
  accent?: boolean;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border p-6 sm:p-8 " +
        (accent
          ? "border-white/25 bg-gradient-to-br from-white/[0.05] to-zinc-950"
          : "border-white/10 bg-zinc-900/40")
      }
    >
      <p
        className={
          "font-mono text-[11px] uppercase tracking-widest " +
          (accent ? "text-zinc-200" : "text-zinc-500")
        }
      >
        {tag}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">
        {title}
      </h3>
      <ul className="mt-6 space-y-3 text-sm text-zinc-300">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3">
            <span
              className={
                "mt-2 size-1.5 shrink-0 rounded-full " +
                (accent ? "bg-white" : "bg-zinc-500")
              }
            />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinalCta() {
  return (
    <section className="relative px-6 py-24 sm:py-32">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-10 sm:p-16">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 80% 0%, rgba(255,255,255,0.12), transparent 60%), radial-gradient(ellipse 60% 80% at 0% 100%, rgba(255,255,255,0.08), transparent 60%)",
          }}
        />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Ready when you are
        </p>
        <h2 className="mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Lift smarter. Get cues that actually fit you.
        </h2>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
          Spin up a live session in your browser, or seed your knowledge graph in
          90 seconds and let the coach learn the rest from your reps.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/lift/squat"
            className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            Start a squat session
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/10"
          >
            Onboarding (90 sec)
          </Link>
          <Link
            href="/coach"
            className="inline-flex items-center gap-1.5 px-2 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
          >
            Chat with your coach
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="inline-block h-6 w-[105px] overflow-hidden">
            <Image
              src="/logo.png"
              alt="Romus logo"
              width={105}
              height={33}
              className="-translate-y-[26%] h-auto w-[105px] max-w-none invert"
            />
          </span>
          <span>
            Romus · MediaPipe + Claude + Backboard · built for lifters who train
            unsupervised.
          </span>
        </div>
        <div className="flex items-center gap-5 text-xs text-zinc-500">
          <Link href="/sessions" className="hover:text-zinc-200">
            Sessions
          </Link>
          <Link href="/coach" className="hover:text-zinc-200">
            Coach
          </Link>
          <Link href="/onboarding" className="hover:text-zinc-200">
            Onboarding
          </Link>
          <a href="https://github.com" className="hover:text-zinc-200">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
