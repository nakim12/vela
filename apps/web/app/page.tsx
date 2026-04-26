 "use client";

import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import type { CountUpProps } from "react-countup";
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
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
import { RevealPreloader } from "@/components/ui/reveal-preloader";

const CountUp = dynamic<CountUpProps>(() => import("react-countup"), {
  ssr: false,
});

const navLinks = [
  { href: "#workflow", label: "Workflow" },
  { href: "#lifts", label: "The Big 3" },
  { href: "#feedback", label: "Feedback" },
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
  const [showPreloader, setShowPreloader] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowPreloader(false);
    }, 1150);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black text-zinc-100 selection:bg-white/20 selection:text-white">
      <RevealPreloader show={showPreloader} text="lift smarter" />
      <SiteNav />
      <div className="fixed inset-0 z-0">
        <Hero />
      </div>
      <div className="relative z-20 mt-[100vh] bg-zinc-950">
        <StatsStrip />
        <HowItWorks />
        <BigThree />
        <FeedbackChannels />
        <Personalization />
        <FinalCta />
        <SiteFooter />
      </div>
    </div>
  );
}

function RevealOnScroll({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.52, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SiteNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(navLinks[0].href);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sectionIds = navLinks
      .map((l) => l.href.replace("#", ""))
      .filter(Boolean);
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => b.intersectionRatio - a.intersectionRatio,
          );
        if (visible.length === 0) return;
        setActiveSection(`#${visible[0].target.id}`);
      },
      {
        root: null,
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.35, 0.5, 0.7],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={
        "fixed inset-x-0 top-0 z-50 transition-all duration-500 " +
        (isScrolled ? "px-3 pt-2" : "px-0 pt-0")
      }
      style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
    >
      <div
        role="presentation"
        className={
          "mx-auto border bg-zinc-900/65 backdrop-blur-xl transition-[width,border-radius,transform,box-shadow,background-color,border-color] duration-700 " +
          (isScrolled
            ? "translate-y-0 border-white/15 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.78)]"
            : "border-white/10 shadow-none")
        }
        style={{
          width: isScrolled ? "min(72rem, calc(100% - 1.5rem))" : "100%",
          borderRadius: isScrolled ? "1rem" : "0rem",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          transitionProperty:
            "width, border-radius, transform, box-shadow, background-color, border-color",
          transitionDuration: isScrolled
            ? "700ms, 700ms, 700ms, 700ms, 700ms, 700ms"
            : "700ms, 180ms, 700ms, 700ms, 700ms, 700ms",
          transitionDelay: isScrolled
            ? "0ms, 0ms, 0ms, 0ms, 0ms, 0ms"
            : "0ms, 520ms, 0ms, 0ms, 0ms, 0ms",
        }}
      >
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-6 py-3.5">
        <Link href="/" className="group inline-flex h-10 items-center p-2 justify-self-start">
          <img
            src="/romus-logo.svg"
            alt="Romus"
            className="h-auto w-[72px] bg-transparent object-contain invert"
            draggable={false}
          />
        </Link>
        <nav
          className="mx-auto hidden items-center gap-7 text-sm text-zinc-400 md:flex"
          onMouseLeave={() => setHoveredSection(null)}
        >
          {/*
            Hover preview: while hovering a nav item, move the glass pill to that
            target; on mouse leave, fall back to the currently active section.
          */}
          {navLinks.map((l) => {
            const active = (hoveredSection ?? activeSection) === l.href;
            return (
              <a
                key={l.href}
                href={l.href}
                onMouseEnter={() => setHoveredSection(l.href)}
                className={
                  "relative isolate inline-flex h-10 items-center justify-center rounded-md px-3 leading-none transition-colors duration-300 " +
                  (active ? "text-white" : "text-zinc-400")
                }
              >
                {active && (
                  <motion.span
                    layoutId="site-nav-active-pill"
                    className="absolute inset-0 rounded-md border border-white/20 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-18px_rgba(255,255,255,0.75)]"
                    initial={false}
                    style={{ willChange: "transform" }}
                    transition={{
                      type: "spring",
                      stiffness: 320,
                      damping: 36,
                      mass: 0.9,
                      bounce: 0.18,
                    }}
                  />
                )}
                <span
                  className={
                    "relative z-10 " +
                    (active ? "[text-shadow:0_0_9px_rgba(255,255,255,0.4)]" : "")
                  }
                >
                  {l.label}
                </span>
              </a>
            );
          })}
        </nav>
        <div className="flex items-center justify-self-end gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="hidden items-center rounded-md border border-white/15 bg-white/5 p-2 text-sm font-medium text-zinc-100 transition hover:border-white/30 hover:bg-white/10 sm:inline-flex">
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "size-10 rounded-md ring-1 ring-white/20 shadow-none",
                },
              }}
            />
          </Show>
        </div>
      </div>
      </div>
    </header>
  );
}

function Hero() {
  const { scrollY } = useScroll();
  const rawBackgroundY = useTransform(scrollY, [0, 1200], [0, -176]);
  const rawContentY = useTransform(scrollY, [0, 1200], [0, -272]);
  const rawBackgroundBlur = useTransform(scrollY, [0, 260, 1200], [0, 8, 14]);
  const rawContentBlur = useTransform(scrollY, [0, 260, 1200], [0, 5, 9]);
  const backgroundY = useSpring(rawBackgroundY, {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001,
  });
  const contentY = useSpring(rawContentY, {
    stiffness: 110,
    damping: 28,
    restDelta: 0.001,
  });
  const backgroundBlur = useSpring(rawBackgroundBlur, {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001,
  });
  const contentBlur = useSpring(rawContentBlur, {
    stiffness: 110,
    damping: 28,
    restDelta: 0.001,
  });
  const backgroundFilter = useMotionTemplate`blur(${backgroundBlur}px)`;
  const contentFilter = useMotionTemplate`blur(${contentBlur}px)`;

  return (
    <section className="relative isolate h-screen overflow-hidden">
        <motion.div
          style={{ y: backgroundY, filter: backgroundFilter }}
          className="pointer-events-none absolute inset-0 scale-110"
        >
          <NeuralBackground
            color="#d4d4d8"
            trailOpacity={0.1}
            particleCount={620}
            speed={0.62}
          />
        </motion.div>

        <motion.div
          style={{ y: contentY, filter: contentFilter }}
          className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 pt-24 pb-28 lg:pt-32 lg:pb-36"
        >
          <div className="grid w-full grid-cols-1 gap-y-8 text-center md:h-[78vh] md:grid-cols-4 md:grid-rows-3 md:gap-x-8 md:gap-y-6 md:text-left">
            <div className="md:col-start-1 md:col-span-2 md:row-start-1 md:self-start">
              <h1 className="text-7xl font-semibold leading-[0.85] tracking-[-0.04em] text-white sm:text-8xl lg:text-[14rem]">
                ROMUS
              </h1>
            </div>

            <div className="md:col-start-3 md:col-span-2 md:row-start-3 md:self-start">
              <p className="max-w-xl text-pretty text-base leading-relaxed text-zinc-200 sm:text-lg">
                A personalized training coach that visualizes your skeletal
                movement in real time, helping you see your form with precision
                and improve technique through targeted feedback on joint and
                limb alignment during lifts.
              </p>
            </div>

            <div className="md:col-start-1 md:col-span-2 md:row-start-3 md:self-start">
              <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-zinc-100 sm:text-4xl lg:text-5xl">
                Cleaner reps for optimal workouts.
              </h2>
            </div>

            <div className="md:col-start-4 md:col-span-1 md:row-start-1 md:self-start md:justify-self-end md:pt-4 md:h-[7.85rem] lg:h-[9.75rem]">
              <div className="grid h-full w-max grid-cols-[auto_auto] grid-rows-2 gap-3">
                <OriginButtonLink
                  href="/lift/squat"
                  className="group col-start-1 row-start-1 row-span-2 inline-flex h-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-base font-semibold text-black transition-colors duration-200 hover:bg-zinc-900 sm:text-lg"
                >
                  <span className="text-left leading-tight">
                    Try squat
                    <br />
                    demo
                  </span>
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </OriginButtonLink>
                <Link
                  href="/upload"
                  className="col-start-2 row-start-1 inline-flex h-full items-center justify-start gap-2 rounded-lg border border-white/15 bg-zinc-900/90 px-5 py-2.5 text-left text-base font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-zinc-800/90 sm:text-lg"
                >
                  Upload a video
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse"
                  />
                </Link>
                <Link
                  href="/onboarding"
                  className="col-start-2 row-start-2 inline-flex h-full items-center justify-start gap-2 rounded-lg border border-white/15 bg-zinc-900/90 px-5 py-2.5 text-left text-base font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-zinc-800/90 sm:text-lg"
                >
                  Set up your profile
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
    </section>
  );
}

function OriginButtonLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [diameter, setDiameter] = useState(320);
  const scale = useMotionValue(0);
  const smoothScale = useSpring(scale, {
    stiffness: 85,
    damping: 18,
    restDelta: 0.001,
  });
  const easedScale = useTransform(smoothScale, [0, 1], [0, 1]);

  const updateCursorState = (
    e: ReactMouseEvent<HTMLAnchorElement>,
    nextScale: 0 | 1,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const maxDimension = Math.hypot(rect.width, rect.height) * 2;
    startTransition(() => {
      setCursorPos({ x, y });
      setDiameter(maxDimension || 320);
    });
    scale.set(nextScale);
  };

  return (
    <Link
      href={href}
      onMouseEnter={(e) => updateCursorState(e, 1)}
      onMouseLeave={(e) => updateCursorState(e, 0)}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-full bg-zinc-900 -translate-x-1/2 -translate-y-1/2"
        style={{
          left: cursorPos.x,
          top: cursorPos.y,
          width: diameter,
          height: diameter,
          scale: easedScale,
        }}
      />
      <span className="relative z-10 inline-flex items-center gap-2 text-inherit transition-colors duration-300 group-hover:text-white">
        {children}
      </span>
    </Link>
  );
}

function StatsStrip() {
  return (
    <section className="border-y border-white/5 bg-white/[0.02]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-y divide-white/5 px-6 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {stats.map((s, i) => (
          <RevealOnScroll
            key={s.label}
            delay={i * 0.06}
            className="px-5 py-7 first:pl-0 last:pr-0 sm:px-6 sm:py-8 sm:first:pl-0 sm:last:pr-0"
          >
            <CountUpValue
              text={s.value}
              className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl"
            />
            <div className="mt-1 text-xs text-zinc-500 sm:text-sm">{s.label}</div>
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}

function CountUpValue({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return <span className={className}>{text}</span>;
  }

  const raw = match[0];
  const value = Number(raw);
  const index = match.index ?? 0;
  const prefix = text.slice(0, index);
  const suffix = text.slice(index + raw.length);
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;

  return (
    <span className={className}>
      <CountUp
        start={0}
        end={value}
        decimals={decimals}
        duration={1.2}
        prefix={prefix}
        suffix={suffix}
        enableScrollSpy
        scrollSpyOnce
      />
    </span>
  );
}

function FixOneRep() {
  return (
    <section id="fix-one-rep" className="relative px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-4xl text-center">
        <RevealOnScroll>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Fix one rep now
          </p>
        </RevealOnScroll>
        <RevealOnScroll delay={0.04}>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Don&apos;t rebuild your whole program. Fix the exact rep that breaks down.
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.08}>
          <p className="mt-5 text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
          A workflow built for lifting: isolate the moment your mechanics fail,
          diagnose it in context, and carry the correction into your next set
          without guesswork.
          </p>
        </RevealOnScroll>
        <RevealOnScroll delay={0.12}>
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
        </RevealOnScroll>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="workflow" className="relative px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <RevealOnScroll>
          <SectionHeader
            eyebrow="Workflow"
            title="Capture. Analyze. Cue. Improve."
            subtitle="One clear loop for every set: read the rep, flag the fault, deliver the cue, track what changed next session."
          />
        </RevealOnScroll>
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ n, title, body, icon: Icon }, i) => (
            <RevealOnScroll key={n} delay={i * 0.06}>
              <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 transition hover:border-white/20 hover:from-white/[0.07]">
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
            </RevealOnScroll>
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
        <RevealOnScroll>
          <SectionHeader
            eyebrow="Three feedback channels"
            title="In the moment, after the set, across the season."
            subtitle="Most form apps pick one channel. We deliver all three because each one fixes a different category of mistake."
          />
        </RevealOnScroll>
        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {channels.map(({ title, body, icon: Icon, chip }, i) => (
            <RevealOnScroll key={title} delay={i * 0.06} className="h-full">
              <div className="relative flex h-full flex-col rounded-xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur">
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
            </RevealOnScroll>
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
        <RevealOnScroll>
          <SectionHeader
            eyebrow="Personalization is the point"
            title="Same rep. Different lifter. Different cue."
            subtitle="Your assistant remembers across sessions. Mobility limits, injury history, anthropometry, even which cue style works for you. Watch the same butt wink that flagged on a fresh account get personalized away on yours."
          />
        </RevealOnScroll>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevealOnScroll>
            <CueCard
              label="Fresh account"
              sublabel="population defaults · no memory"
              cues={freshAccountCues}
              tone="muted"
            />
          </RevealOnScroll>
          <RevealOnScroll delay={0.06}>
            <CueCard
              label="Your account"
              sublabel="grounded in your knowledge graph"
              cues={knownLifterCues}
              tone="accent"
            />
          </RevealOnScroll>
        </div>

        <RevealOnScroll delay={0.1}>
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
        </RevealOnScroll>
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
        <RevealOnScroll>
          <SectionHeader
            eyebrow="The Big 3"
            title="Rules tuned for the lifts that matter."
            subtitle="Each lift gets a dedicated segmenter and rule set. Population defaults out of the box; your assistant overrides them when it has reason."
          />
        </RevealOnScroll>
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {lifts.map((lift, i) => (
            <RevealOnScroll key={lift.name} delay={i * 0.06} className="h-full">
              <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 p-6 transition hover:border-white/30">
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
                  className="mt-auto pt-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-200 transition hover:text-white"
                >
                  Try {lift.name.toLowerCase()} live
                  <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                </Link>
              </div>
            </RevealOnScroll>
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
        <RevealOnScroll>
          <SectionHeader
            eyebrow="Architecture"
            title="On-device where speed matters. On the server where memory does."
            subtitle="If Backboard hiccups, the rules engine and overlay still work. The agent layer is enhancement, not dependency."
          />
        </RevealOnScroll>
        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevealOnScroll>
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
          </RevealOnScroll>
          <RevealOnScroll delay={0.06}>
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
          </RevealOnScroll>
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
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-10 sm:p-16">
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
        <RevealOnScroll delay={0.04}>
          <h2 className="mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Lift smarter. Get cues that actually fit you.
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.08}>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            Spin up a live session in your browser, or seed your knowledge graph in
            90 seconds and let the coach learn the rest from your reps.
          </p>
        </RevealOnScroll>
        <RevealOnScroll delay={0.12}>
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
        </RevealOnScroll>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <RevealOnScroll>
          <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="grid size-6 place-items-center rounded-md border border-white/30 bg-white/10">
            <span className="size-1.5 rounded-full bg-white" />
          </span>
          <span>
            Vela · MediaPipe + Claude + Backboard · built for lifters who train
            unsupervised.
          </span>
          </div>
        </RevealOnScroll>
        <RevealOnScroll delay={0.05}>
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
        </RevealOnScroll>
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
