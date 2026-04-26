import NeuralBackground from "@/components/ui/flow-field-background";

export function DemoBackgroundPaths() {
  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-black">
      <NeuralBackground
        color="#ffffff"
        trailOpacity={0.1}
        particleCount={450}
        speed={0.8}
      />
    </div>
  );
}
