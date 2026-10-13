import { useState } from "react";
import { motion } from "framer-motion";
import { Ghost, Lock, UserRoundPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../store/auth.store";
import { createGuest } from "../services/auth.api";
import { apiErrorMessage } from "../services/api";
import { toast } from "../components/ui/Toast";

export default function GuestEntry() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const continueAsGuest = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await createGuest();
      useAuthStore.getState().setSession(res.user, res.accessToken, res.refreshToken);
      toast("success", `You'll appear as ${res.user.displayName}`);
      navigate("/permissions");
    } catch (err) {
      toast("error", apiErrorMessage(err, "Could not start a guest session"));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-strong w-full p-8"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/30 to-white/15">
          <Ghost className="h-7 w-7 text-brand-light" />
        </div>
        <h2 className="text-center font-display text-2xl font-semibold text-white">
          How do you want to join?
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Your identity stays anonymous either way — a random handle, no personal info.
        </p>

        <div className="mt-7 space-y-3">
          <Button size="lg" loading={loading} onClick={continueAsGuest} className="w-full">
            <Ghost className="h-5 w-5" />
            Continue as Guest
          </Button>

          <button
            disabled
            className="glass flex h-14 w-full cursor-not-allowed items-center justify-center gap-2 text-sm text-slate-500"
            title="Accounts arrive in the next phase"
          >
            <UserRoundPlus className="h-4 w-4" />
            Create Account
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
              Coming soon
            </span>
          </button>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Guest sessions are temporary. Blocks, reports and bans persist; the rest of your
          data is minimal by design.
        </div>
      </motion.div>
    </div>
  );
}
