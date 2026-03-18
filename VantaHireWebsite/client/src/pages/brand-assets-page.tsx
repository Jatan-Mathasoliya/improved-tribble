import { Helmet } from "react-helmet-async";
import { Download, FileType, Copy, Check, Image, Video, FileText, MessageSquare, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/Layout";
import { useState } from "react";

// Messaging Guidelines Data
const taglineHierarchy = [
  { level: "Primary", text: "Recruiting Velocity, by Design", usage: "Hero, Logo lockup" },
  { level: "Secondary", text: "Human decisions, AI acceleration.", usage: "Subheadline, signature" },
  { level: "Tertiary", text: "Built with recruiters, not around them.", usage: "Supporting copy" }
];

const keyPhrases = [
  { use: "Recruiting velocity", insteadOf: "Faster hiring" },
  { use: "Human decisions, AI acceleration", insteadOf: "AI-powered" },
  { use: "Built with recruiters", insteadOf: "Built for recruiters" },
  { use: "At a glance", insteadOf: "Easy to use" },
  { use: "Designed for velocity", insteadOf: "Fast" },
  { use: "Zero friction", insteadOf: "Simple" },
  { use: "Day-1 productive", insteadOf: "Easy onboarding" }
];

const audienceMessaging = [
  {
    audience: "Consulting Firms/Agencies",
    message: "50+ roles across clients? Velocity without chaos. Do more with less."
  },
  {
    audience: "Startups",
    message: "Your ATS shouldn't slow you down. 2X efficiency makes a lean team feel twice its size."
  },
  {
    audience: "Leadership",
    message: "Pipeline health and recruiter activity—visible without chasing updates."
  },
  {
    audience: "Recruiters",
    message: "Less clicking, more recruiting. Know where to start every day."
  }
];

const coreValues = [
  {
    title: "Recruiter-First",
    description: "If it adds clicks, it doesn't ship."
  },
  {
    title: "Velocity Over Bureaucracy",
    description: "Built for teams that move fast."
  },
  {
    title: "Clarity Over Complexity",
    description: "Answers at a glance, not in exports."
  }
];

const handleDownload = (file: string, name: string) => {
  const link = document.createElement("a");
  link.href = file;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function BrandAssetsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyColor = (color: string, name: string) => {
    navigator.clipboard.writeText(color);
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  };

  const brandColors = [
    { name: "Purple Primary", hex: "#7B38FB", rgb: "123, 56, 251" },
    { name: "Purple Dark", hex: "#5B21B6", rgb: "91, 33, 182" },
    { name: "Gold/Amber", hex: "#F59E0B", rgb: "245, 158, 11" },
    { name: "Pink Accent", hex: "#FF5BA8", rgb: "255, 91, 168" },
    { name: "Dark Background", hex: "#0D0D1A", rgb: "13, 13, 26" },
    { name: "Secondary BG", hex: "#141428", rgb: "20, 20, 40" },
  ];

  return (
    <Layout>
      <Helmet>
        <title>Brand & Messaging | VantaHire</title>
        <meta name="description" content="VantaHire brand assets, messaging guidelines, and official logos. Recruiting Velocity, by Design." />
        <link rel="canonical" href="https://vantahire.com/brand" />
        <meta property="og:title" content="Brand & Messaging | VantaHire" />
        <meta property="og:description" content="VantaHire brand assets, messaging guidelines, and official logos. Recruiting Velocity, by Design." />
        <meta property="og:url" content="https://vantahire.com/brand" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Brand & Messaging | VantaHire" />
        <meta name="twitter:description" content="VantaHire brand assets, messaging guidelines, and official logos. Recruiting Velocity, by Design." />
        <meta name="twitter:image" content="https://vantahire.com/twitter-image.jpg" />
      </Helmet>

      <div className="public-theme min-h-screen bg-background text-foreground">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-warning/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: "1.2s" }}></div>

        <div className="container mx-auto px-4 py-8 relative z-10">
          {/* Header */}
          <div className="text-center mb-16 pt-16">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#F59E0B] rounded-full mx-auto mb-6"></div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className="text-white">Brand &</span>{" "}
              <span className="bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">Messaging</span>
            </h1>
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
              Official VantaHire brand assets, messaging guidelines, and visual identity.
            </p>
          </div>

          {/* Primary Logo Section */}
          <section className="mb-16 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Primary Logo</h2>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 overflow-hidden mb-6">
              {/* Logo Preview - Dark Background */}
              <div className="bg-[#0D0D1A] p-12 flex items-center justify-center">
                <img
                  src="/brand/vantahire-logo.png"
                  alt="VantaHire Logo"
                  className="max-h-40 w-auto"
                />
              </div>

              {/* Logo Preview - Light Background */}
              <div className="bg-white p-12 flex items-center justify-center border-t border-white/10">
                <img
                  src="/brand/vantahire-logo.png"
                  alt="VantaHire Logo on Light"
                  className="max-h-40 w-auto"
                />
              </div>
            </Card>

            {/* Logo Download Options */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-4">
                <div className="flex flex-col items-center text-center">
                  <Image className="h-8 w-8 text-primary mb-2" />
                  <h3 className="text-white font-semibold text-sm mb-1">PNG</h3>
                  <p className="text-white/50 text-xs mb-3">High resolution</p>
                  <Button
                    size="sm"
                    onClick={() => handleDownload("/brand/vantahire-logo.png", "vantahire-logo.png")}
                    className="w-full bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-4">
                <div className="flex flex-col items-center text-center">
                  <FileType className="h-8 w-8 text-primary mb-2" />
                  <h3 className="text-white font-semibold text-sm mb-1">SVG</h3>
                  <p className="text-white/50 text-xs mb-3">Vector format</p>
                  <Button
                    size="sm"
                    onClick={() => handleDownload("/brand/vantahire-logo.svg", "vantahire-logo.svg")}
                    className="w-full bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-4">
                <div className="flex flex-col items-center text-center">
                  <Image className="h-8 w-8 text-primary mb-2" />
                  <h3 className="text-white font-semibold text-sm mb-1">JPG</h3>
                  <p className="text-white/50 text-xs mb-3">With background</p>
                  <Button
                    size="sm"
                    onClick={() => handleDownload("/brand/vantahire-logo.jpg", "vantahire-logo.jpg")}
                    className="w-full bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-4">
                <div className="flex flex-col items-center text-center">
                  <FileText className="h-8 w-8 text-primary mb-2" />
                  <h3 className="text-white font-semibold text-sm mb-1">PDF</h3>
                  <p className="text-white/50 text-xs mb-3">Print ready</p>
                  <Button
                    size="sm"
                    onClick={() => handleDownload("/brand/vantahire-logo.pdf", "vantahire-logo.pdf")}
                    className="w-full bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </Card>
            </div>

            {/* Large Logo */}
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Image className="h-6 w-6 text-warning" />
                  <div>
                    <h3 className="text-white font-semibold">High Resolution Logo</h3>
                    <p className="text-white/50 text-xs">Extra large PNG for print</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleDownload("/brand/vantahire-logo-large.png", "vantahire-logo-large.png")}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <Download className="h-4 w-4 mr-2" />
                  PNG (Large)
                </Button>
              </div>
            </Card>
          </section>

          {/* Icon/Favicon Section */}
          <section className="mb-16 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Icon / Favicon</h2>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 overflow-hidden">
                <div className="bg-[#0D0D1A] p-8 flex items-center justify-center">
                  <img
                    src="/brand/vantahire-icon.png"
                    alt="VantaHire Icon"
                    className="h-32 w-32 object-contain"
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="text-white font-semibold mb-3">App Icon</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleDownload("/brand/vantahire-icon.png", "vantahire-icon.png")}
                      className="bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                    >
                      PNG
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDownload("/brand/vantahire-icon.svg", "vantahire-icon.svg")}
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      SVG
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDownload("/brand/vantahire-icon.jpg", "vantahire-icon.jpg")}
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      JPG
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Animated Logo */}
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 overflow-hidden">
                <div className="bg-[#0D0D1A] p-8 flex items-center justify-center">
                  <video
                    src="/brand/vantahire-logo-animated.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-32 w-auto"
                  />
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">Animated Logo</h3>
                      <p className="text-white/50 text-xs">MP4 video format</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload("/brand/vantahire-logo-animated.mp4", "vantahire-logo-animated.mp4")}
                      className="bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                    >
                      <Video className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Social Media Section */}
          <section className="mb-16 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Social Media</h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* LinkedIn Banner JPG */}
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 overflow-hidden md:col-span-2">
                <div className="bg-[#0D0D1A] p-4 flex items-center justify-center">
                  <img
                    src="/brand/vantahire-linkedin-banner.jpg"
                    alt="LinkedIn Banner"
                    className="w-full h-auto max-h-48 object-contain"
                  />
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">LinkedIn Banner</h3>
                      <p className="text-white/60 text-xs">1584 × 396px • JPG</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload("/brand/vantahire-linkedin-banner.jpg", "vantahire-linkedin-banner.jpg")}
                      className="bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Social Square JPG */}
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 overflow-hidden">
                <div className="bg-[#0D0D1A] p-4 flex items-center justify-center aspect-square">
                  <img
                    src="/brand/vantahire-social-square.jpg"
                    alt="Social Square"
                    className="w-full h-full object-contain"
                  />
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">Profile Image</h3>
                      <p className="text-white/60 text-xs">Square format • JPG</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload("/brand/vantahire-social-square.jpg", "vantahire-social-square.jpg")}
                      className="bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-600 hover:to-amber-600"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* SVG Templates */}
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
                <h3 className="text-white font-semibold mb-4">SVG Templates</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">LinkedIn Banner</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload("/brand/linkedin-banner.svg", "vantahire-linkedin-banner.svg")}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      SVG
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">LinkedIn Job Post</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload("/brand/linkedin-job-post.svg", "vantahire-linkedin-job-post.svg")}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      SVG
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Social Square</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload("/brand/social-square.svg", "vantahire-social-square.svg")}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      SVG
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Twitter/X Header</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload("/brand/twitter-header.svg", "vantahire-twitter-header.svg")}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      SVG
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* Brand Colors */}
          <section className="mb-16 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Brand Colors</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {brandColors.map((color) => (
                <Card
                  key={color.name}
                  className="bg-white/10 backdrop-blur-sm border-white/20 overflow-hidden cursor-pointer hover:bg-white/15 transition-all"
                  onClick={() => copyColor(color.hex, color.name)}
                >
                  <div
                    className="h-24 w-full"
                    style={{ backgroundColor: color.hex }}
                  />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium text-sm">{color.name}</p>
                        <p className="text-white/50 text-xs font-mono">{color.hex}</p>
                      </div>
                      {copied === color.name ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Copy className="h-4 w-4 text-white/40" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-white/40 text-sm text-center mt-4">Click any color to copy hex code</p>
          </section>

          {/* Brand Messaging Section */}
          <section className="mb-16 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Brand Messaging</h2>

            {/* Tagline Hierarchy */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-6">
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Tagline Hierarchy
              </h3>
              <div className="space-y-4">
                {taglineHierarchy.map((item, index) => (
                  <div key={index} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 p-4 bg-white/5 rounded-lg">
                    <Badge variant="outline" className="w-fit border-primary/50 text-primary">
                      {item.level}
                    </Badge>
                    <p className="text-white font-medium flex-1">"{item.text}"</p>
                    <p className="text-white/50 text-sm">{item.usage}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Core Values */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-6">
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Core Values
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {coreValues.map((value, index) => (
                  <div key={index} className="p-4 bg-white/5 rounded-lg">
                    <h4 className="text-white font-semibold mb-2">{value.title}</h4>
                    <p className="text-white/60 text-sm">{value.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Phrases */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-6">
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Key Phrases
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-primary font-medium">Use This</th>
                      <th className="text-left py-3 px-4 text-white/50 font-medium">Instead Of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyPhrases.map((phrase, index) => (
                      <tr key={index} className="border-b border-white/5">
                        <td className="py-3 px-4 text-white">{phrase.use}</td>
                        <td className="py-3 px-4 text-white/50 line-through">{phrase.insteadOf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audience Messaging */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-8">
              <h3 className="text-xl font-semibold text-white mb-6">Audience Messaging</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {audienceMessaging.map((item, index) => (
                  <div key={index} className="p-4 bg-white/5 rounded-lg">
                    <p className="text-primary text-sm font-medium mb-2">{item.audience}</p>
                    <p className="text-white/80">"{item.message}"</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Usage Guidelines */}
          <section className="mb-16 max-w-5xl mx-auto">
            <div className="bg-white/5 border border-white/10 rounded-xl p-8">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <FileType className="h-5 w-5 text-primary" />
                Logo Usage Guidelines
              </h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-white font-medium mb-3">Do's</h3>
                  <ul className="text-white/70 space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-success">✓</span>
                      Use the logo on dark or light backgrounds
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">✓</span>
                      Maintain minimum clear space around the logo
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">✓</span>
                      Scale proportionally
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">✓</span>
                      Use on professional marketing materials
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-white font-medium mb-3">Don'ts</h3>
                  <ul className="text-white/70 space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-destructive">✗</span>
                      Don't alter the logo colors
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive">✗</span>
                      Don't stretch or distort the logo
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive">✗</span>
                      Don't add effects like shadows or glows
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive">✗</span>
                      Don't place on busy backgrounds
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Request More Assets */}
          <div className="text-center py-12 border-t border-white/10 max-w-5xl mx-auto">
            <h3 className="text-white font-semibold mb-2">Need additional assets?</h3>
            <p className="text-white/50 text-sm mb-6">
              Request custom formats or specific dimensions.
            </p>
            <a href="mailto:hello@vantahire.com?subject=Brand Asset Request">
              <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                Request Custom Assets
              </Button>
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
