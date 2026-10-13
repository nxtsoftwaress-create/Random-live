import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Gavel, HeartCrack, ShieldAlert, VideoOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../store/auth.store";

const guidelines = [
  { icon: ShieldAlert, text: "No harassment, hate speech, or bullying" },
  { icon: Ban, text: "No sexual content or nudity" },
  { icon: HeartCrack, text: "No threats, violence, or illegal activity" },
  { icon: Gavel, text: "No scams, spam, or impersonation" },
  { icon: VideoOff, text: "No recording or screenshots without consent" },
];

export default function SafetyGate() {
  const navigate = useNavigate();
  const agree = useAuthStore((s) => s.agree);
  const [step, setStep] = useState<"age" | "rules">("age");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-10">
      <AnimatePresence mode="wait">
        {step === "age" ? (
          <motion.div
            key="age"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className="glass-strong w-full p-8 text-center"
          >
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/30 to-white/15">
              <ShieldAlert className="h-7 w-7 text-brand-light" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-white">Before you enter</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Random Live is a live video platform for adults. To keep the community safe,
              everyone passes through a quick safety check first.
            </p>
            <p className="mt-6 font-display text-lg font-semibold text-white">
              Are you 18 years or older?
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={() => setStep("rules")} className="sm:min-w-[10rem]">
                Yes, continue
              </Button>
              <Button variant="secondary" onClick={() => navigate("/")} className="sm:min-w-[10rem]">
                Exit
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="rules"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className="glass-strong w-full p-8"
          >
            <h2 className="text-center font-display text-2xl font-semibold text-white">
              Community Guidelines
            </h2>
            <p className="mt-2 text-center text-sm text-slate-400">
              These rules are enforced by automated systems and human moderators. Violations
              lead to reports, restrictions, or permanent bans.
            </p>
            <ul className="mt-6 space-y-3">
              {guidelines.map((g, i) => (
                <motion.li
                  key={g.text}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.09 }}
                  className="glass flex items-center gap-3 px-4 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15">
                    <g.icon className="h-4 w-4 text-rose-300" />
                  </span>
                  <span className="text-sm text-slate-200">{g.text}</span>
                </motion.li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                onClick={() => {
                  agree();
                  navigate("/guest");
                }}
                className="sm:min-w-[12rem]"
              >
                I Agree — Continue
              </Button>
              <Button variant="ghost" onClick={() => setStep("age")}>
                Back
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
