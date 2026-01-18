import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const Cta = () => {
  const openCalendar = () => {
    trackEvent("cta_click", { location: "cta_block", action: "get_walkthrough" });
    window.open('https://cal.com/vantahire/quick-connect', '_blank');
  };

  return (
    <section className="py-32 relative z-10 cta-glow">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
          Ready to Recruit Faster?
        </h2>
        <p className="text-[var(--text-secondary)] text-lg md:text-xl mb-4 max-w-xl mx-auto">
          Remove the friction. Double your efficiency.
        </p>
        <p className="text-[var(--text-muted)] text-base mb-10">
          Start free. No credit card required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="gold"
            onClick={() => {
              trackEvent("cta_click", { location: "cta_block", action: "start_recruiting_faster" });
              window.location.href = '/recruiter-auth';
            }}
            className="rounded-lg px-8 py-6 text-base font-semibold"
          >
            Start Recruiting Faster
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button
            variant="outlinePurple"
            onClick={openCalendar}
            className="rounded-lg px-8 py-6 text-base"
          >
            Get a Walkthrough
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Cta;
