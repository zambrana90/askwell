import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { AppClerkProvider } from "../components/auth/app-clerk-provider";
import { Demo } from "../components/landing/demo";
import { Footer } from "../components/landing/footer";
import { LandingHeader } from "../components/landing/header";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { Install } from "../components/landing/install";
import { landingWidgetKey } from "../components/landing/landing-widget";
import { Pricing } from "../components/landing/pricing";

export const metadata: Metadata = {
  title: `${APP_NAME}: an AI support chat for your website`,
  description: `${APP_NAME} answers your visitors' questions from your own content. Add one script tag to your site.`,
};

// LANDING_WIDGET_KEY is read at request time, so this page must not be prerendered at build.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <AppClerkProvider>
      <div className="theme-dark min-h-screen overflow-x-clip bg-canvas text-ink">
        <LandingHeader />
        <main>
          <Hero />
          <HowItWorks />
          <Demo widgetKey={landingWidgetKey()} />
          <Pricing />
          <Install />
        </main>
        <Footer />
      </div>
    </AppClerkProvider>
  );
}
