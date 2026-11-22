import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { Demo } from "../components/landing/demo";
import { Footer } from "../components/landing/footer";
import { LandingHeader } from "../components/landing/header";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { Install } from "../components/landing/install";
import { Pricing } from "../components/landing/pricing";

export const metadata: Metadata = {
  title: `${APP_NAME}: an AI support chat for your website`,
  description: `${APP_NAME} answers your visitors' questions from your own content. Add one script tag to your site.`,
};

export default function Home() {
  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas text-ink">
      <LandingHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Demo />
        <Pricing />
        <Install />
      </main>
      <Footer />
    </div>
  );
}
