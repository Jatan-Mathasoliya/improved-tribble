import { Quote } from "lucide-react";

const testimonials = [
  {
    quote: "I used to spend half my day navigating our old ATS. Now I spend it recruiting.",
    attribution: "Recruiter, Consulting Firm"
  },
  {
    quote: "For the first time, I open my ATS and know exactly what to do.",
    attribution: "TA Lead, Series B Startup"
  },
  {
    quote: "It's the first recruiting system that feels like it was built by someone who actually recruited.",
    attribution: "Founder, Staffing Agency"
  }
];

const SocialProof = () => {
  return (
    <section className="py-20 relative z-10 bg-[var(--bg-secondary)]/50">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Trusted by recruiting teams who source.
            </h2>
            <p className="text-[var(--text-muted)]">
              Hear from recruiters who made the switch.
            </p>
          </div>

          {/* Testimonials Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)] rounded-xl p-6"
              >
                {/* Quote Icon */}
                <div className="mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Quote className="w-5 h-5 text-primary" />
                  </div>
                </div>

                {/* Testimonial */}
                <blockquote className="text-lg text-white mb-4 leading-relaxed">
                  "{testimonial.quote}"
                </blockquote>

                {/* Attribution */}
                <p className="text-[var(--text-muted)] text-sm">
                  — {testimonial.attribution}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
