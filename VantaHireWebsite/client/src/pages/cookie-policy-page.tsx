import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cookie, Settings, BarChart3, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";

export default function CookiePolicyPage() {
  const handleOpenCookiePreferences = () => {
    window.dispatchEvent(new CustomEvent('cookie-consent:open', { detail: { reset: true } }));
  };

  return (
    <Layout>
      <Helmet>
        <title>Cookie Policy | VantaHire</title>
        <meta name="description" content="VantaHire Cookie Policy. Learn about the cookies we use and how to manage your preferences." />
        <link rel="canonical" href="https://www.vantahire.com/cookie-policy" />
        <meta property="og:title" content="Cookie Policy | VantaHire" />
        <meta property="og:description" content="Learn about cookies used on VantaHire and manage your preferences." />
        <meta property="og:url" content="https://www.vantahire.com/cookie-policy" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Cookie Policy | VantaHire" />
        <meta name="twitter:description" content="Learn about cookies used on VantaHire and manage your preferences." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
      </Helmet>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Cookie className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Cookie Policy</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Last Updated: January 2025
          </p>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">What Are Cookies?</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <p>
                Cookies are small text files that are placed on your device when you visit a website.
                They are widely used to make websites work more efficiently and provide a better user experience.
              </p>
              <p>
                VantaHire uses cookies and similar tracking technologies to enhance your experience,
                analyze usage, and provide personalized features.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                Types of Cookies We Use
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <div>
                <h3 className="text-foreground font-semibold mb-2">1. Essential Cookies (Always Active)</h3>
                <p className="mb-2">
                  These cookies are necessary for the website to function and cannot be disabled.
                  They enable core functionality such as:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>User authentication and session management</li>
                  <li>Security features and CSRF protection</li>
                  <li>Remember your login status</li>
                  <li>Shopping cart functionality (if applicable)</li>
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cookie names: <code className="bg-muted px-1 py-0.5 rounded">session_id</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">csrf_token</code>
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">2. Analytics Cookies (Optional)</h3>
                <p className="mb-2">
                  These cookies help us understand how visitors use our platform by collecting
                  anonymous information about:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Pages visited and time spent on each page</li>
                  <li>Click patterns and navigation paths</li>
                  <li>Browser type, device, and screen resolution</li>
                  <li>Geographic location (country/city level)</li>
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">
                  Service provider: Google Analytics
                </p>
                <p className="text-sm text-muted-foreground">
                  Cookie names: <code className="bg-muted px-1 py-0.5 rounded">_ga</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">_gid</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">_gat</code>
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">3. Functional Cookies (Optional)</h3>
                <p className="mb-2">
                  These cookies enable enhanced functionality and personalization:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Remember your preferences (language, theme)</li>
                  <li>Store your cookie consent choices</li>
                  <li>Personalize content based on your role (candidate/recruiter)</li>
                  <li>Remember form inputs to prevent data loss</li>
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cookie names: <code className="bg-muted px-1 py-0.5 rounded">cookie_consent</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">user_preferences</code>
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">4. Performance Cookies (Optional)</h3>
                <p className="mb-2">
                  These cookies help us monitor and improve platform performance:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Load times and page rendering speed</li>
                  <li>Error tracking and debugging</li>
                  <li>A/B testing for feature improvements</li>
                  <li>Server response times</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Third-Party Cookies
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <p>
                We use third-party services that may set their own cookies on your device:
              </p>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Google Analytics</h3>
                <p>
                  We use Google Analytics to analyze website traffic and user behavior. Google Analytics
                  sets cookies to track sessions and collect anonymous usage data.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Learn more: <a
                    href="https://policies.google.com/technologies/cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary underline"
                  >
                    Google Cookie Policy
                  </a>
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Google Cloud Platform</h3>
                <p>
                  We use Google Cloud for hosting and file storage. Google may set cookies for
                  authentication and performance monitoring.
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">OpenAI API</h3>
                <p>
                  Our AI-powered features use OpenAI's API. While OpenAI does not set cookies directly
                  on our site, your data is processed by their servers in accordance with their privacy policy.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Cookie Duration
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <div>
                <h3 className="text-foreground font-semibold mb-2">Session Cookies</h3>
                <p>
                  Temporary cookies that are deleted when you close your browser. Used for authentication
                  and session management.
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Persistent Cookies</h3>
                <p className="mb-2">
                  Remain on your device for a set period or until manually deleted:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Analytics cookies: Up to 2 years</li>
                  <li>Preference cookies: Up to 1 year</li>
                  <li>Consent cookies: Up to 1 year</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                Managing Your Cookie Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <div>
                <h3 className="text-foreground font-semibold mb-2">Cookie Consent Banner</h3>
                <p className="mb-4">
                  When you first visit VantaHire, you will see a cookie consent banner. You can choose
                  to accept or decline optional cookies. Essential cookies cannot be disabled as they
                  are necessary for the site to function.
                </p>
                <Button
                  onClick={handleOpenCookiePreferences}
                  className="bg-primary hover:bg-primary/80 text-foreground"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Cookie Preferences
                </Button>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Browser Settings</h3>
                <p className="mb-2">
                  Most browsers allow you to control cookies through their settings. You can:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Block all cookies</li>
                  <li>Block third-party cookies only</li>
                  <li>Delete cookies after each session</li>
                  <li>Set exceptions for specific websites</li>
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">
                  Note: Blocking essential cookies may prevent you from using VantaHire.
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-semibold mb-2">Browser-Specific Instructions</h3>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li>
                    <strong>Chrome:</strong>{" "}
                    <a
                      href="https://support.google.com/chrome/answer/95647"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary underline"
                    >
                      Manage cookies in Chrome
                    </a>
                  </li>
                  <li>
                    <strong>Firefox:</strong>{" "}
                    <a
                      href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary underline"
                    >
                      Manage cookies in Firefox
                    </a>
                  </li>
                  <li>
                    <strong>Safari:</strong>{" "}
                    <a
                      href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary underline"
                    >
                      Manage cookies in Safari
                    </a>
                  </li>
                  <li>
                    <strong>Edge:</strong>{" "}
                    <a
                      href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary underline"
                    >
                      Manage cookies in Edge
                    </a>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                Deleting Cookies
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <p>
                You can delete cookies at any time through your browser settings. However, this may:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Log you out of your account</li>
                <li>Reset your preferences and settings</li>
                <li>Affect site functionality and performance</li>
                <li>Require you to accept the cookie banner again</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Do Not Track (DNT)</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <p>
                Some browsers include a "Do Not Track" (DNT) feature. Currently, there is no industry
                standard for responding to DNT signals. VantaHire does not currently respond to DNT
                signals, but you can manage your cookie preferences through our consent banner.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Changes to This Policy</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <p>
                We may update this Cookie Policy from time to time to reflect changes in technology,
                legislation, or our practices. We will notify you of any significant changes by updating
                the "Last Updated" date at the top of this page.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4">
              <p>
                If you have questions about our use of cookies, please contact us:
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p><strong className="text-foreground">Deori RecruiterHub Solutions OPC Pvt Ltd</strong></p>
                <p>Email: privacy@vantahire.com</p>
                <p>Subject: Cookie Policy Inquiry</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
