type GridBackdropProps = {
  className?: string;
};

export function GridBackdrop({ className }: GridBackdropProps) {
  return (
    <div
      aria-hidden
      className={
        "pointer-events-none absolute inset-0 overflow-hidden " + (className ?? "")
      }
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(244,244,245,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(244,244,245,0.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, #000 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-lime-400/20 blur-[120px]" />
      <div className="absolute top-40 left-[12%] h-72 w-72 rounded-full bg-emerald-500/10 blur-[100px]" />
      <div className="absolute top-20 right-[8%] h-72 w-72 rounded-full bg-cyan-400/10 blur-[100px]" />
    </div>
  );
}
