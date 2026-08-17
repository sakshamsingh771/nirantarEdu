import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar.jsx";

function useCountUp(target, durationMs = 1200, start) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime;
    let raf;
    const step = (t) => {
      if (!startTime) startTime = t;
      const progress = Math.min((t - startTime) / durationMs, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, target, durationMs]);
  return value;
}

function useInView() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

const features = [
  {
    title: "Offline Learning",
    body: "Lessons, notes and resources open instantly from the local server — no connection to the outside world needed.",
  },
  {
    title: "Local School Server",
    body: "One machine in the school building runs the entire platform for every classroom on the local network.",
  },
  {
    title: "Offline Assessments",
    body: "Quizzes are timed, scored, and recorded the moment a student submits, entirely on-site.",
  },
  {
    title: "Nirantar AI",
    body: "A local AI assistant, powered by Ollama, explains concepts and drafts questions without calling out to the internet.",
  },
  {
    title: "Teacher Tools",
    body: "Upload material, build assignments and quizzes, and track every class from one dashboard.",
  },
  {
    title: "Secure School Access",
    body: "Every account is tied to a school code — only your school's students, teachers and admins can sign in.",
  },
  {
    title: "Automatic Local Saving",
    body: "Work is written to the local database the instant it's submitted, so nothing is lost between bell and break.",
  },
  {
    title: "Optional Data Sync",
    body: "If the school's internet connection returns, selected records can sync outward — but nothing here waits on it.",
  },
];

const steps = [
  { n: "1", title: "School Server", body: "The school installs NirantarEdu once, on a single local computer." },
  { n: "2", title: "Connect", body: "Students and teachers join the school Wi-Fi — no SIM, no broadband required." },
  { n: "3", title: "Learn", body: "Lessons, quizzes and assignments run entirely over the local network." },
  { n: "4", title: "Sync", body: "If the internet returns later, the school can optionally back up selected data." },
];

function StatCounter({ target, label, suffix, inView }) {
  const value = useCountUp(target, 1400, inView);
  return (
    <div>
      <div className="text-3xl font-bold text-brand-800 sm:text-4xl">
        {value}
        {suffix}
      </div>
      <div className="mt-1 text-sm text-ink-faint">{label}</div>
    </div>
  );
}

export default function Home() {
  const [statsRef, statsInView] = useInView();
  const [openFeature, setOpenFeature] = useState(null);

  return (
    <div className="min-h-screen bg-canvas-card">
      <Navbar />

      {/* HERO */}
      <section id="home" className="relative overflow-hidden border-b border-brand-100 bg-brand-900">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center rounded-full border border-brand-500/40 bg-brand-800/60 px-3 py-1 text-xs font-medium text-brand-100">
              A digital classroom that runs entirely on your school's network
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl">
              Learning Doesn't Stop <br className="hidden sm:block" />
              When the Internet Does.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-brand-100">
              NirantarEdu keeps classrooms connected through a secure local learning network —
              even during complete internet outages.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/register" className="rounded-md bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600">
                Start Learning
              </Link>
              <a href="#features" className="rounded-md border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-canvas-card/10">
                Explore Features
              </a>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-sm rounded-xl border border-white/10 bg-brand-800/50 p-6">
              <div className="flex items-center justify-between text-xs font-medium text-brand-200">
                <span>Internet</span>
                <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-300">OFFLINE</span>
              </div>
              <div className="my-3 flex justify-center text-brand-400">
                <svg className="h-5 w-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div className="rounded-lg border border-brand-500/40 bg-brand-700/60 px-4 py-3 text-center text-sm font-semibold text-white">
                School Local Server
              </div>
              <div className="my-3 flex justify-center text-brand-400">
                <svg className="h-5 w-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div className="flex justify-center gap-3 text-xs font-medium text-brand-100">
                <span className="rounded bg-brand-700/60 px-3 py-1.5">Students</span>
                <span className="rounded bg-brand-700/60 px-3 py-1.5">Teachers</span>
              </div>
              <div className="mt-4 rounded-lg bg-emerald-500/15 px-4 py-2 text-center text-sm font-semibold text-emerald-300">
                Learning Continues
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section ref={statsRef} className="border-b border-brand-100 bg-canvas-sunk">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8">
          <StatCounter target={0} suffix="" label="Internet connections required" inView={statsInView} />
          <StatCounter target={100} suffix="%" label="Features work offline" inView={statsInView} />
          <StatCounter target={3} suffix="" label="Roles: Admin, Teacher, Student" inView={statsInView} />
          <StatCounter target={1} suffix="" label="Server per school" inView={statsInView} />
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-brand-900">Everything a classroom needs, running locally</h2>
          <p className="mt-3 text-ink-soft">
            Every one of these works with the school's internet connection completely switched off.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <button
              key={f.title}
              onClick={() => setOpenFeature(openFeature === i ? null : i)}
              className="card text-left transition hover:border-brand-300 hover:shadow-md"
            >
              <h3 className="font-semibold text-brand-800">{f.title}</h3>
              <p className={`mt-2 text-sm text-ink-soft ${openFeature === i ? "" : "line-clamp-2"}`}>{f.body}</p>
              <span className="mt-3 inline-block text-xs font-medium text-brand-600">
                {openFeature === i ? "Show less" : "Read more"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-y border-brand-100 bg-canvas-sunk py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-brand-900">How it works</h2>
            <p className="mt-3 text-ink-soft">From install to classroom, in four steps.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="card">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold text-brand-800">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOR STUDENTS / TEACHERS */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2">
          <div id="students" className="card">
            <h3 className="text-xl font-bold text-brand-900">For Students</h3>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>• Open notes, PDFs and videos the moment your teacher posts them</li>
              <li>• Take timed quizzes with instant, automatic scoring</li>
              <li>• Submit assignments that save locally the moment you tap submit</li>
              <li>• Ask Nirantar AI to explain a topic or generate practice questions</li>
            </ul>
          </div>
          <div id="teachers" className="card">
            <h3 className="text-xl font-bold text-brand-900">For Teachers</h3>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>• Upload material once — every student in the class sees it instantly</li>
              <li>• Build quizzes by hand or ask Nirantar AI to draft questions</li>
              <li>• Grade submissions and send feedback, all from one dashboard</li>
              <li>• Track class performance and spot weak topics early</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="border-t border-brand-100 bg-brand-900 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white">Internet can disappear. Learning doesn't have to.</h2>
          <p className="mt-4 text-brand-100">
            NirantarEdu gives every classroom a digital learning space that lives on the school's own network —
            study material, assignments, quizzes and an AI study assistant, all running locally, with cloud sync
            as an optional extra, never a requirement.
          </p>
          <Link to="/register" className="mt-8 inline-flex rounded-md bg-accent-500 px-6 py-3 text-sm font-semibold text-white hover:bg-accent-600">
            Get Started
          </Link>
        </div>
      </section>

      <footer className="bg-brand-950 bg-brand-900 py-8 text-center text-sm text-brand-200">
        © {new Date().getFullYear()} NirantarEdu — 100% Offline-First School Learning Platform
      </footer>
    </div>
  );
}
