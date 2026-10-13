import { useState } from "react";
import { CheckCircle2, Flag } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { clsx } from "clsx";

const CATEGORIES = [
  "Harassment",
  "Spam",
  "Nudity / sexual content",
  "Hate speech",
  "Threats",
  "Scam",
  "Underage concern",
  "Other",
];

export function ReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const close = (): void => {
    onClose();
    // Reset shortly after the exit animation.
    window.setTimeout(() => {
      setCategory(null);
      setDetail("");
      setSubmitting(false);
      setSubmitted(false);
    }, 300);
  };

  const submit = (): void => {
    if (!category) return;
    setSubmitting(true);
    // Moderation queue API ships in the safety phase — acknowledge for now.
    window.setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 700);
  };

  return (
    <Modal open={open} onClose={close} title={submitted ? undefined : "Report this user"}>
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <p className="font-display text-lg font-semibold text-white">Report received</p>
          <p className="max-w-xs text-sm text-slate-400">
            Thanks — our moderation team will review this session. Evidence is retained
            according to our privacy policy.
          </p>
          <p className="text-xs text-slate-600">
            (Automated + human moderation pipeline ships in the safety phase.)
          </p>
          <Button variant="secondary" onClick={close} className="mt-2">
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={clsx("chip text-left text-xs sm:text-sm", category === c && "chip-active")}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            className="input-dark min-h-[72px] resize-none"
            placeholder="Optional details for the moderators…"
            maxLength={500}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting} disabled={!category}>
              <Flag className="h-4 w-4" />
              Submit report
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
