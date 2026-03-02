import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

// Hero Video Component - seamless blend with site background
const HeroVideo = () => (
  <div className="relative w-full max-w-2xl mx-auto">
    {/* Video with all-edge fade to blend into #0D0D1A background */}
    <div
      className="relative overflow-hidden"
      style={{
        maskImage: `
          radial-gradient(ellipse 80% 70% at 40% 50%, black 50%, transparent 100%)
        `,
        WebkitMaskImage: `
          radial-gradient(ellipse 80% 70% at 40% 50%, black 50%, transparent 100%)
        `,
      }}
    >
      <video
        poster="/og-image.jpg"
        preload="none"
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-auto scale-110"
        style={{
          clipPath: 'inset(0 12% 0 0)', // Crop right to hide watermark
        }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  </div>
);

const Hero = () => {
  const [isVisible] = useState(true);

  // Function to open Cal.com in a new window/tab
  const openCalendar = () => {
    trackEvent("cta_click", { location: "home_hero", action: "get_walkthrough" });
    window.open('https://cal.com/vantahire/quick-connect', '_blank');
  };


  return (
    <section id="hero" className="container mx-auto px-4 pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden">
      <div className={`flex flex-col lg:flex-row items-center gap-12 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        {/* Left Content */}
        <div className="lg:w-1/2 text-center lg:text-left">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-fade-in-up">
            <Sparkles className="w-4 h-4 text-warning" />
            <span className="text-sm text-primary">Recruiter-First ATS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 animate-fade-in-up-delay-1">
            <span className="gradient-text-purple">Recruiting Velocity,</span>
            <br />
            <span className="text-white">by</span>{" "}
            <span className="gradient-text-gold">Design</span>
          </h1>

          <p className="text-xl text-white/80 mb-2 max-w-xl mx-auto lg:mx-0 leading-relaxed animate-fade-in-up-delay-2">
            Human decisions, AI acceleration.
          </p>

          <p className="text-lg text-muted-foreground/70 mb-4 max-w-xl mx-auto lg:mx-0 leading-relaxed animate-fade-in-up-delay-2">
            The recruiter-first ATS designed to remove friction—and double your team's efficiency.
          </p>

          {/* Trust Signal */}
          <p className="text-sm text-muted-foreground/70 mb-8 animate-fade-in-up-delay-2">
            Purpose-built for consulting firms, agencies, startups, and high-velocity teams.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in-up-delay-3">
            <Button
              variant="gold"
              onClick={() => {
                trackEvent("cta_click", { location: "home_hero", action: "start_free" });
                window.location.href = '/recruiter-auth';
              }}
              className="rounded-full px-8 py-6 text-lg font-semibold"
            >
              Start Free
            </Button>
            <Button
              variant="outlinePurple"
              onClick={openCalendar}
              className="rounded-full px-8 py-6 text-lg"
            >
              <Zap className="w-5 h-5 mr-2" />
              Get a Walkthrough
            </Button>
          </div>
        </div>

        {/* Right - Hero Video */}
        <div className="lg:w-1/2 flex justify-center animate-fade-in-up-delay-2">
          <HeroVideo />
        </div>
      </div>
    </section>
  );
};

export default Hero;
