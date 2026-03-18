import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Mail, Lock, Database, Users, Eye } from "lucide-react";
import { Helmet } from "react-helmet-async";

export default function PrivacyPolicyPage() {
  return (
    <Layout>
      <Helmet>
        <title>Privacy Policy | VantaHire</title>
        <meta name="description" content="VantaHire Privacy Policy. Learn how we collect, use, and protect your personal information when using our recruiter-first ATS platform." />
        <link rel="canonical" href="https://vantahire.com/privacy-policy" />
        <meta property="og:title" content="Privacy Policy | VantaHire" />
        <meta property="og:description" content="Learn how VantaHire protects your privacy and handles your data." />
        <meta property="og:url" content="https://vantahire.com/privacy-policy" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Privacy Policy | VantaHire" />
        <meta name="twitter:description" content="Learn how VantaHire protects your privacy and handles your data." />
        <meta name="twitter:image" content="https://vantahire.com/twitter-image.jpg" />
      </Helmet>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Last Updated: January 2025
          </p>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                VantaHire, a brand of <a href="https://www.airevolabs.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Airevolabs LLP</a> ("we," "our," or "us"),
                is committed to protecting your privacy. This Privacy Policy explains how we collect,
                use, disclose, and safeguard your information when you use our applicant tracking system
                and recruitment platform.
              </p>
              <p>
                By using VantaHire, you agree to the collection and use of information in accordance
                with this policy. If you do not agree with our policies and practices, please do not use our services.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Information We Collect
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <div>
                <h3 className="text-foreground font-semibold mb-2">Personal Information</h3>
                <p className="mb-2">When you register or use our services, we may collect:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Name, email address, and contact information</li>
                  <li>Resume/CV and professional credentials</li>
                  <li>Employment history and educational background</li>
                  <li>Skills, certifications, and professional qualifications</li>
                  <li>LinkedIn profile and other professional social media links</li>
                  <li>Application responses and form submissions</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Automatically Collected Information</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>IP address, browser type, and device information</li>
                  <li>Usage data and interaction patterns</li>
                  <li>Cookies and similar tracking technologies</li>
                  <li>Analytics data about how you use our platform</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">AI-Generated Data</h3>
                <p>
                  Our platform uses AI to analyze resumes and match candidates with jobs. This analysis
                  generates fit scores and recommendations, which are stored with your application data.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                How We Use Your Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>We use the collected information for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Processing and managing job applications</li>
                <li>Matching candidates with suitable job opportunities</li>
                <li>Communicating with you about your applications and our services</li>
                <li>Providing AI-powered resume analysis and job fit scoring</li>
                <li>Improving our platform and user experience</li>
                <li>Sending notifications about application status updates</li>
                <li>Conducting analytics and research to enhance our services</li>
                <li>Complying with legal obligations and protecting our rights</li>
                <li>Preventing fraud and ensuring platform security</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                Data Sharing and Disclosure
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <div>
                <h3 className="text-foreground font-semibold mb-2">With Recruiters and Employers</h3>
                <p>
                  When you apply for a job, your application data, resume, and AI fit scores are shared
                  with the recruiter or employer posting that position. They can view, download, and
                  manage your application through our platform.
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Service Providers</h3>
                <p>We may share your information with trusted third-party service providers who assist us in:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Cloud storage and hosting (Google Cloud Storage)</li>
                  <li>Email delivery services</li>
                  <li>Analytics and performance monitoring</li>
                  <li>AI and machine learning services (OpenAI API)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Legal Requirements</h3>
                <p>
                  We may disclose your information if required by law, court order, or government request,
                  or to protect our rights, property, or safety.
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">We Do Not Sell Your Data</h3>
                <p>
                  We do not sell, rent, or trade your personal information to third parties for marketing purposes.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Data Security
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                We implement industry-standard security measures to protect your information, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Encrypted data transmission (HTTPS/TLS)</li>
                <li>Secure authentication and session management</li>
                <li>CSRF protection on all state-changing operations</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and role-based permissions</li>
                <li>Secure cloud storage with Google Cloud Platform</li>
              </ul>
              <p className="mt-4">
                However, no method of transmission over the internet is 100% secure. While we strive to
                protect your information, we cannot guarantee absolute security.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Your Rights</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>You have the right to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Rectification:</strong> Correct inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
                <li><strong>Objection:</strong> Object to certain types of data processing</li>
                <li><strong>Withdrawal:</strong> Withdraw consent for optional data processing</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us using the information provided below.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Data Retention</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                We retain your personal information for as long as necessary to provide our services and
                comply with legal obligations. Specifically:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Active accounts: Data retained while your account is active</li>
                <li>Inactive accounts: May be deleted after 2 years of inactivity</li>
                <li>Application data: Retained as long as the job posting is active plus 1 year</li>
                <li>Legal requirements: Data may be retained longer if required by law</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Cookies and Tracking</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                We use cookies and similar tracking technologies to enhance your experience.
                For detailed information, please see our <a href="/cookie-policy" className="text-primary hover:text-primary underline">Cookie Policy</a>.
              </p>
              <p>
                You can manage your cookie preferences through our Cookie Consent banner or your browser settings.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                VantaHire is not intended for individuals under the age of 18. We do not knowingly collect
                personal information from children. If we become aware that we have collected data from a
                child, we will take steps to delete such information.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Changes to This Policy</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any significant
                changes by posting the new policy on this page and updating the "Last Updated" date.
              </p>
              <p>
                Your continued use of VantaHire after changes are posted constitutes acceptance of the updated policy.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground/50 space-y-4">
              <p>
                If you have questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p><strong className="text-foreground"><a href="https://www.airevolabs.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Airevolabs LLP</a></strong></p>
                <p>Email: privacy@vantahire.com</p>
                <p>Subject: Privacy Policy Inquiry</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
