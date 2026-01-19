import { Zap, MousePointerClick, Eye, Rocket } from "lucide-react";

const stats = [
  {
    number: "2X",
    label: "Faster Workflows",
    description: "Daily workflows completed in half the time",
    icon: <Zap className="w-5 h-5" />
  },
  {
    number: "70%",
    label: "Fewer Clicks",
    description: "From candidate view to action—no tab maze",
    icon: <MousePointerClick className="w-5 h-5" />
  },
  {
    number: "1",
    label: "Glance Visibility",
    description: "Pipeline status and bottlenecks—no reports",
    icon: <Eye className="w-5 h-5" />
  },
  {
    number: "Day 1",
    label: "Productive",
    description: "No manuals, no 6-week onboarding",
    icon: <Rocket className="w-5 h-5" />
  }
];

const Stats = () => {
  return (
    <section className="py-20 bg-[var(--bg-secondary)] border-y border-[var(--border-subtle)] relative z-10">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Designed for 2X Efficiency
          </h2>
          <p className="text-[var(--text-muted)]">
            Zero complexity. Measurable results.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {stats.map((stat, index) => (
            <div key={index} className="text-center p-6 rounded-xl bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)]">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 text-primary mb-4">
                {stat.icon}
              </div>
              <div className="stat-number text-3xl md:text-4xl font-bold mb-1">
                {stat.number}
              </div>
              <div className="text-white font-medium text-sm mb-2">
                {stat.label}
              </div>
              <div className="text-[var(--text-muted)] text-xs leading-relaxed">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
