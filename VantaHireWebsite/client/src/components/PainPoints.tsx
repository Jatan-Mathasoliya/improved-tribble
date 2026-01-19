import { HelpCircle, MousePointerClick, Boxes, ArrowRight } from "lucide-react";

const painPoints = [
  {
    icon: <HelpCircle className="w-6 h-6 text-red-400" />,
    text: "No clear daily starting point — you open it and wonder where to begin"
  },
  {
    icon: <MousePointerClick className="w-6 h-6 text-red-400" />,
    text: "Too many clicks for simple actions — tools slow you down instead of speeding you up"
  },
  {
    icon: <Boxes className="w-6 h-6 text-red-400" />,
    text: "Built for complexity, not clarity — workflows designed for enterprises, not recruiters"
  }
];

const PainPoints = () => {
  return (
    <section className="pt-20 pb-8 relative z-10">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-12 text-center">
            Why Recruiters Hate Their ATS
          </h2>

          {/* Pain Points List */}
          <div className="max-w-xl mx-auto">
            <div className="space-y-5 mb-8">
              {painPoints.map((point, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 text-lg text-[var(--text-secondary)]"
                >
                  <span className="flex-shrink-0 mt-1">{point.icon}</span>
                  <span>{point.text}</span>
                </div>
              ))}
            </div>

            {/* Transition */}
            <p className="text-[var(--text-muted)] mb-6">
              The result? Recruiters spend more time managing the ATS than recruiting.
            </p>

            {/* Contrast */}
            <a
              href="/product"
              className="inline-flex items-center gap-3 text-xl font-semibold group cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => { e.preventDefault(); window.location.href = '/product'; }}
            >
              <ArrowRight className="w-6 h-6 text-primary" />
              <span className="gradient-text-purple">We built VantaHire to give you that time back.</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PainPoints;
