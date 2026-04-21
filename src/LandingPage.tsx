import type { ReactNode } from "react";
import { BookOpen, MessageCircle, QrCode, Sparkles, Users } from "lucide-react";

type LandingPageProps = {
  onOpenApp: () => void;
};

export default function LandingPage({ onOpenApp }: LandingPageProps) {
  return (
    <div className="min-h-screen text-ink">
      <header className="glass sticky top-0 z-10 border-b border-white/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <span className="font-display text-xl font-semibold tracking-tight text-tide">GyanSetu</span>
          <button
            type="button"
            onClick={onOpenApp}
            className="rounded-full bg-tide px-5 py-2.5 text-sm font-medium text-white shadow-panel transition hover:bg-tide/90"
          >
            Open app
          </button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 md:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-tide/20 bg-white/80 px-4 py-1.5 text-sm text-slate shadow-sm">
            <Sparkles className="h-4 w-4 text-tide" aria-hidden />
            Live classroom pulse
          </p>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Teach and learn in sync, in the room or on the web.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate">
            GyanSetu connects teachers and students with session codes and QR join links, real-time feedback, and a
            single experience on Android and browser.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onOpenApp}
              className="inline-flex items-center justify-center rounded-[24px] bg-tide px-8 py-3.5 text-base font-semibold text-white shadow-panel transition hover:-translate-y-0.5 hover:bg-tide/90"
            >
              Sign in / Join a session
            </button>
            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-[24px] border border-slate-200 bg-white/90 px-8 py-3.5 text-base font-medium text-ink shadow-sm transition hover:border-tide/30"
            >
              See how it works
            </a>
          </div>
        </section>

        <section id="features" className="border-t border-white/60 bg-white/40 py-16">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-2">
            <FeatureCard
              icon={<QrCode className="h-6 w-6" />}
              title="Codes & QR"
              body="Students join with a short code or by scanning a QR that opens the session in the browser."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Roles that fit"
              body="Teachers run the room; students participate with the same live data and clear status."
            />
            <FeatureCard
              icon={<MessageCircle className="h-6 w-6" />}
              title="Room feedback"
              body="Signals and summaries help you notice confusion or slowdown while class is still in progress."
            />
            <FeatureCard
              icon={<BookOpen className="h-6 w-6" />}
              title="Web + Android"
              body="One codebase for the installable app and the web - share links without juggling different tools."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-mist/50 py-10 text-center text-sm text-slate">
        <p className="font-display font-medium text-ink">GyanSetu</p>
        <p className="mt-2">Built for live classrooms.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-panel">
      <div className="inline-flex rounded-2xl bg-mist p-3 text-tide">{icon}</div>
      <h2 className="mt-4 font-display text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate">{body}</p>
    </article>
  );
}
