import { Zap, TrendingUp, Layers } from "lucide-react";

const outcomes = [
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Faster shortlists",
    description: "Ranked, engagement-ready candidates delivered in minutes — not days of manual searching."
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Higher recruiter output",
    description: "Manage more roles with fewer tools, fewer handoffs, and clearer daily priorities."
  },
  {
    icon: <Layers className="w-5 h-5" />,
    title: "Lower recruiting costs",
    description: "Replace 4-6 separate tools with one platform. Consolidate your stack without losing capability."
  }
];

const Stats = () => {
  return (
    <section className="py-20 bg-[var(--bg-secondary)] border-y border-[var(--border-subtle)] relative z-10">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Recruit faster with less effort.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {outcomes.map((outcome, index) => (
            <div key={index} className="text-center p-8 rounded-xl bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)]">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 text-primary mb-5">
                {outcome.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                {outcome.title}
              </h3>
              <p className="text-[var(--text-muted)] text-sm leading-relaxed">
                {outcome.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
