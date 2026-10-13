import { motion } from "framer-motion";
import { ArrowRight, MessageSquareText, ShieldCheck, Sparkles, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../store/auth.store";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

const features = [
  {
    icon: Video,
    title: "Video Chat",
    text: "Face-to-face with someone new in seconds — direct peer-to-peer video.",
  },
  {
    icon: MessageSquareText,
    title: "Text Chat",
    text: "Prefer typing? Live chat rides alongside every video session.",
  },
  {
    icon: Sparkles,
    title: "Interests",
    text: "Matched by language and shared interests — or go fully random.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const agreedToTerms = useAuthStore((s) => s.agreedToTerms);
  const hasAuth = useAuthStore((s) => !!s.accessToken && !!s.user);

  const start = (): void => {
    if (!agreedToTerms) navigate("/safety");
    else if (!hasAuth) navigate("/guest");
    else navigate("/preferences");
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col items-center">
        <motion.div
          variants={item}
          className="glass mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-slate-300"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Safe &amp; moderated · 18+ only
        </motion.div>

        <motion.h1
          variants={item}
          className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl"
        >
          Meet people.
          <br />
          <span className="text-gradient">Talk. Connect.</span>
        </motion.h1>

        <motion.p variants={item} className="mt-6 max-w-xl text-balance text-lg text-slate-400">
          Random live conversations with real people around the world — matched in seconds,
          streamed peer-to-peer.
        </motion.p>

        <motion.div variants={item} className="mt-10">
          <Button size="lg" onClick={start} className="group">
            Start Chat
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>

        <motion.div variants={item} className="mt-14 grid w-full gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -4 }}
              className="glass p-6 text-left"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand/30 to-white/15">
                <f.icon className="h-5 w-5 text-brand-light" />
              </div>
              <h3 className="font-display text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={item} className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
          <span>Zero sign-up</span>
          <span className="hidden h-1 w-1 rounded-full bg-slate-700 sm:block" />
          <span>Peer-to-peer media</span>
          <span className="hidden h-1 w-1 rounded-full bg-slate-700 sm:block" />
          <span>Report &amp; block built-in</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
