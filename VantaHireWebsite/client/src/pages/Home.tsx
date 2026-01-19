import Header from "@/components/Header";
import Hero from "@/components/Hero";
import PainPoints from "@/components/PainPoints";
import Services from "@/components/Services";
import Stats from "@/components/Stats";
import SocialProof from "@/components/SocialProof";
import Cta from "@/components/Cta";
import Footer from "@/components/Footer";
import { Helmet } from "react-helmet-async";

// Circuit Background Animation Component (landing-specific visual)
const CircuitBackground = () => (
  <div className="circuit-bg">
    {/* Animated circuit lines */}
    <div className="circuit-line"></div>
    <div className="circuit-line"></div>
    <div className="circuit-line"></div>
    <div className="circuit-line"></div>
    <div className="circuit-line"></div>
    {/* Glowing circuit dots */}
    <div className="circuit-dot"></div>
    <div className="circuit-dot"></div>
    <div className="circuit-dot"></div>
    <div className="circuit-dot"></div>
  </div>
);

const Home = () => {
  return (
    <>
      <Helmet>
        <title>VantaHire - Recruiting Velocity, by Design | Recruiter-First ATS</title>
        <meta name="description" content="The recruiter-first ATS designed to remove friction and double your team's efficiency. Human decisions, AI acceleration. Built for consulting firms, agencies, and startups." />
        <link rel="canonical" href="https://www.vantahire.com/" />
        <meta property="og:title" content="Recruiting Velocity, by Design" />
        <meta property="og:description" content="The recruiter-first ATS designed to remove friction. Human decisions, AI acceleration." />
        <meta property="og:url" content="https://www.vantahire.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="VantaHire - Recruiting Velocity, by Design" />
        <meta name="twitter:description" content="The recruiter-first ATS designed to remove friction and double your team's efficiency." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
      </Helmet>
      <div className="public-theme min-h-screen bg-background text-foreground">
        <CircuitBackground />
        <div className="relative z-10">
          <Header />
          <Hero />
          <PainPoints />
          <Services />
          <Stats />
          <SocialProof />
          <Cta />
          <Footer />
        </div>
      </div>
    </>
  );
};

export default Home;
