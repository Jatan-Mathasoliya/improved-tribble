import { LayoutDashboard, SlidersHorizontal, Target, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const pillars = [
  {
    number: "01",
    icon: <LayoutDashboard className="w-7 h-7" />,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    title: "Recruiter Dashboard",
    subtitle: "Know Where to Start",
    description: "Clear daily priorities. Open VantaHire and know exactly what needs attention—today."
  },
  {
    number: "02",
    icon: <SlidersHorizontal className="w-7 h-7" />,
    iconBg: "bg-warning/20",
    iconColor: "text-warning",
    title: "Flexible Screening",
    subtitle: "Screen Your Way",
    description: "Manual review when you need control. AI screening when volume demands speed. Your call."
  },
  {
    number: "03",
    icon: <Target className="w-7 h-7" />,
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400",
    title: "Job Command Center",
    subtitle: "One Job, One Place",
    description: "Candidates, outreach, scheduling—all centered on the job. No more 12-tab chaos."
  },
  {
    number: "04",
    icon: <BarChart3 className="w-7 h-7" />,
    iconBg: "bg-gradient-to-br from-purple-500/15 to-amber-500/15",
    iconColor: "text-primary",
    title: "Leadership Insights",
    subtitle: "Visibility, Not Micromanagement",
    description: "Real-time pipeline health and bottleneck detection—without running reports or chasing updates."
  }
];

const Services = () => {
  return (
    <section id="features" className="py-24 relative z-10">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            What Efficiency Looks Like
          </h2>
          <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto">
            Most recruiting systems add features. We remove friction.
          </p>
        </div>

        {/* Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {pillars.map((pillar, index) => (
            <div key={index} className="service-card relative">
              {/* Number Badge */}
              <div className="absolute top-6 right-6 text-4xl font-bold text-white/10">
                {pillar.number}
              </div>

              {/* Icon */}
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${pillar.iconBg}`}>
                <span className={pillar.iconColor}>{pillar.icon}</span>
              </div>

              {/* Title & Subtitle */}
              <h3 className="text-xl font-bold text-white mb-1">{pillar.title}</h3>
              <p className="text-primary text-sm font-medium mb-3">{pillar.subtitle}</p>

              {/* Description */}
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Links */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <Button
            variant="outlinePurple"
            onClick={() => window.location.href = '/features'}
            className="rounded-full px-6 py-5"
          >
            See All Features
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => window.location.href = '/product'}
            className="text-white/70 hover:text-white"
          >
            Learn More About the Product
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Services;
