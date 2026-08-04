"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "./store";
import CinematicBackdrop from "./cinematic-backdrop";

const FONT = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ACCENT = "#1E88FF";

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const channels = [
  {
    title: "Email",
    value: "support@luffytv.app",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    title: "Discord",
    value: "Join our community",
    href: "https://discord.gg/GEVes3uhtM",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
  },
  {
    title: "Twitter / X",
    value: "@LuffyTVOfficial",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
];

export default function ContactPage() {
  const navigate = useAppStore(s => s.navigate);
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send to an API
    setSubmitted(true);
  };

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = `${ACCENT}70`;
    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "";
    e.currentTarget.style.background = "";
  };

  const inputCls = "w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all";
  const labelCls = "block text-[11px] font-bold tracking-wider uppercase text-[#767d8a] mb-2";

  return (
    <div className="ltv-cine-root min-h-screen w-full text-white overflow-x-hidden" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <CinematicBackdrop particleCount={16} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-28 pb-20">
        {/* ═══ HEADER ═══ */}
        <div className="text-center mb-14">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="ltv-cine-eyebrow inline-block text-xs font-bold uppercase px-3 py-1.5 rounded-full border border-[#1E88FF]/25 bg-[#1E88FF]/[0.06] mb-6"
          >
            Get in Touch
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="ltv-cine-gradient-text text-4xl sm:text-5xl font-black leading-[1.05]"
            style={{ fontFamily: FONT }}
          >
            Contact us
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22 }}
            className="text-[#a1a7b3] text-base max-w-md mx-auto mt-4 leading-relaxed"
          >
            A question, a request, a broken server — we read everything and answer fast.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ LEFT: channels ═══ */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {channels.map((item, i) => {
              const inner = (
                <>
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0" style={{ background: "rgba(30,136,255,0.10)", color: "#48A6FF" }}>
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white mb-0.5">{item.title}</h3>
                    <p className="text-[13px] text-[#a1a7b3]">{item.value}</p>
                  </div>
                </>
              );
              return (
                <Reveal key={item.title} delay={0.1 + i * 0.08}>
                  {item.href ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" className="ltv-cine-surface flex items-start gap-4 p-5 rounded-2xl">
                      {inner}
                    </a>
                  ) : (
                    <div className="ltv-cine-surface flex items-start gap-4 p-5 rounded-2xl">
                      {inner}
                    </div>
                  )}
                </Reveal>
              );
            })}

            <Reveal delay={0.35}>
              <div className="ltv-cine-surface p-5 rounded-2xl">
                <h3 className="text-sm font-bold mb-2" style={{ color: "#48A6FF" }}>Quick Answers</h3>
                <p className="text-[13px] text-[#a1a7b3] leading-relaxed mb-3">
                  Is Luffy TV free? Yes — completely free, no sign-up required to start watching.
                  Most answers live in the Guide.
                </p>
                <button onClick={() => navigate({ page: "guide" })} className="ltv-cine-btn-secondary px-4 py-2 rounded-full text-xs font-bold">
                  Open the Guide
                </button>
              </div>
            </Reveal>
          </div>

          {/* ═══ RIGHT: form ═══ */}
          <div className="lg:col-span-3">
            {submitted ? (
              <Reveal>
                <div className="ltv-cine-surface flex flex-col items-center justify-center py-16 text-center rounded-2xl">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(30,136,255,0.12)" }}>
                    <svg className="w-8 h-8" style={{ color: "#48A6FF" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black text-white mb-2" style={{ fontFamily: FONT }}>Message sent</h3>
                  <p className="text-sm text-[#a1a7b3] mb-6 max-w-xs">
                    Thanks for reaching out. We'll get back to you as soon as possible.
                  </p>
                  <button onClick={() => navigate({ page: "home" })} className="ltv-cine-btn-primary px-6 py-3 rounded-full font-bold text-sm">
                    Back to Home
                  </button>
                </div>
              </Reveal>
            ) : (
              <Reveal delay={0.15}>
                <form onSubmit={handleSubmit} className="ltv-cine-surface space-y-5 p-6 sm:p-8 rounded-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Name</label>
                      <input
                        required
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        onFocus={focusStyle}
                        onBlur={blurStyle}
                        placeholder="Your name"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        onFocus={focusStyle}
                        onBlur={blurStyle}
                        placeholder="your@email.com"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Subject</label>
                    <input
                      required
                      value={formData.subject}
                      onChange={e => setFormData({ ...formData, subject: e.target.value })}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                      placeholder="What is this about?"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Message</label>
                    <textarea
                      required
                      rows={5}
                      value={formData.message}
                      onChange={e => setFormData({ ...formData, message: e.target.value })}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                      placeholder="Tell us what's on your mind..."
                      className={`${inputCls} resize-none`}
                    />
                  </div>

                  <button type="submit" className="ltv-cine-btn-primary w-full flex items-center justify-center gap-2 py-3.5 rounded-full font-bold text-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Send Message
                  </button>
                </form>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
