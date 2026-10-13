import { AnimatePresence, motion } from "framer-motion";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { ChatMessage } from "../types/chat";

export interface ChatBoxProps {
  messages: ChatMessage[];
  selfId: string | null;
  partnerTyping: boolean;
  disabled?: boolean;
  onSend: (body: string) => void;
  onTyping: (typing: boolean) => void;
  className?: string;
}

function timeOf(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatBox({
  messages,
  selfId,
  partnerTyping,
  disabled = false,
  onSend,
  onTyping,
  className,
}: ChatBoxProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);
  const lastTypingSent = useRef<number>(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, partnerTyping]);

  const handleChange = (value: string): void => {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      onTyping(true);
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => onTyping(false), 2000);
  };

  const handleSend = (): void => {
    const body = draft.trim();
    if (!body || disabled) return;
    onSend(body);
    setDraft("");
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    onTyping(false);
  };

  return (
    <div className={clsx("glass-strong flex flex-col overflow-hidden", className)}>
      <div className="border-b border-white/10 px-4 py-3">
        <span className="font-display text-sm font-semibold text-white">Chat</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !partnerTyping && (
          <p className="pt-6 text-center text-sm text-slate-500">
            Say hi — messages are filtered and rate-limited.
          </p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const self = m.senderId === selfId;
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={clsx("flex", self ? "justify-end" : "justify-start")}
              >
                <div
                  className={clsx(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    self
                      ? "rounded-br-md bg-gradient-to-r from-brand to-brand-dark text-white"
                      : "rounded-bl-md border border-white/10 bg-white/[0.06] text-slate-100",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <span
                    className={clsx(
                      "mt-0.5 block text-[10px]",
                      self ? "text-white/60" : "text-slate-500",
                    )}
                  >
                    {timeOf(m.createdAt)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {partnerTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-3.5 py-2.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-slate-400"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            className="input-dark flex-1"
            placeholder="Type a message…"
            maxLength={500}
            value={draft}
            disabled={disabled}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={disabled || !draft.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-brand to-brand-dark text-white shadow-glow transition hover:brightness-110 disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
