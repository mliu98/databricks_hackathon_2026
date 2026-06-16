import { useNavigate } from 'react-router';
import { Button } from '@databricks/appkit-ui/react';
import { ArrowRight } from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* Background photograph */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/img/cloudy-blue-sky.jpg')" }}
        aria-hidden
      />
      {/* Dark + accent wash to keep the glass legible and on-brand */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 35%, rgba(87,255,196,0.08), transparent 45%), linear-gradient(180deg, rgba(10,10,12,0.45) 0%, rgba(10,10,12,0.35) 45%, rgba(10,10,12,0.55) 100%)',
        }}
        aria-hidden
      />

      {/* Glassmorphism card */}
      <div className="relative w-full max-w-xl">
        <div className="rounded-[32px] border border-white/15 bg-white/[0.07] px-8 py-12 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:px-12 sm:py-16">
          {/* Logo, centered */}
          <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] shadow-inner backdrop-blur-xl">
            <img
              src="/img/indian-flag.svg"
              alt="Indian flag"
              className="h-20 w-20 object-contain"
            />
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">COPD Care Planner</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
            Find where India&apos;s highest-risk gaps in respiratory care are, how confident we are they are real, and
            where care interventions can help limited resources reach the people who need them most.
          </p>

          <Button
            size="lg"
            onClick={() => void navigate('/planner')}
            className="mt-10 gap-2 rounded-full px-8 py-6 text-base font-semibold shadow-[0_0_32px_rgba(87,255,196,0.25)] transition-transform hover:scale-[1.03]"
          >
            Close the gap
            <ArrowRight className="h-5 w-5" />
          </Button>

          <p className="mt-6 text-xs text-white/45">Track 2 · COPD Care Planner · Built on Databricks</p>
        </div>
      </div>
    </div>
  );
}
