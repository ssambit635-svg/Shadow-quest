import { useEffect, useRef, useState, type FormEvent } from "react";
import { useReady } from "../lib/ready";
import { matchMizuReply, MIZU_REPLIES, type MizuTopic } from "../lib/mizu";
import "../styles/mizu.css";

const SEEN_KEY = "sq.mizu.welcomed.v1";
const MUTED_KEY = "sq.mizu.muted.v1";
const ASSETS = import.meta.env.BASE_URL;
const TOPICS: { topic: MizuTopic; label: string }[] = [
  { topic: "start", label: "How do I start?" },
  { topic: "focus", label: "Find my focus" },
  { topic: "streak", label: "Build a streak" },
  { topic: "motivation", label: "Cheer me on" },
];

function readSetting(key: string) {
  try { return sessionStorage.getItem(key) === "1"; } catch { return false; }
}
function saveSetting(key: string, enabled: boolean) {
  try { sessionStorage.setItem(key, enabled ? "1" : "0"); } catch { /* Optional in private WebViews. */ }
}

export function MizuGuide({ onEnter }: { onEnter: () => void }) {
  const ready = useReady();
  const [available, setAvailable] = useState(false);
  const [intro, setIntro] = useState(() => !readSetting(SEEN_KEY));
  const [open, setOpen] = useState(() => !readSetting(SEEN_KEY));
  const [topic, setTopic] = useState<MizuTopic>("welcome");
  const [question, setQuestion] = useState("");
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(() => readSetting(MUTED_KEY));
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playbackId = useRef(0);
  const reply = MIZU_REPLIES[topic];

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setAvailable(true), 700);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (available && open && !intro) inputRef.current?.focus();
  }, [available, open, intro]);

  const stopAudio = () => {
    playbackId.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
  };

  const dock = (restoreFocus = false) => {
    stopAudio();
    setIntro(false);
    setOpen(false);
    saveSetting(SEEN_KEY, true);
    if (restoreFocus) launcherRef.current?.focus();
  };

  // A silent welcome also finishes by itself. Reading or interacting switches
  // to chat mode; a playing introduction docks on the actual audio ended event.
  useEffect(() => {
    if (!available || !open || !intro || playing) return;
    const timer = window.setTimeout(() => {
      setOpen(false);
      setIntro(false);
      saveSetting(SEEN_KEY, true);
      if (panelRef.current?.contains(document.activeElement)) launcherRef.current?.focus();
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [available, open, intro, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    const onHidden = () => {
      if (document.hidden) {
        playbackId.current += 1;
        audio?.pause();
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      playbackId.current += 1;
      audio?.pause();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  async function speak(next: MizuTopic) {
    stopAudio();
    setAudioError("");
    const file = MIZU_REPLIES[next].audio;
    const audio = audioRef.current;
    if (!audio || !file) return;
    const id = playbackId.current;
    audio.src = `${ASSETS}audio/mizu-${file}.mp3`;
    // Only called by deliberate clicks/submits, never by an auto-open effect.
    try {
      setPlaying(true);
      await audio.play();
    } catch {
      if (id !== playbackId.current) return;
      setPlaying(false);
      setAudioError("Voice couldn’t play. You can still read everything here, or tap Listen to retry.");
    }
  }

  function answer(next: MizuTopic, asked: string) {
    stopAudio();
    setIntro(false);
    saveSetting(SEEN_KEY, true);
    setTopic(next);
    setQuestion(asked);
    setAudioError("");
    if (!muted) void speak(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message) return;
    answer(matchMizuReply(message), message);
    setInput("");
  }

  return (
    <>
      <audio ref={audioRef} preload="none" onEnded={() => {
        setPlaying(false);
        if (intro) dock(!!panelRef.current?.contains(document.activeElement));
      }} onError={() => {
        setPlaying(false);
        setAudioError("Voice is unavailable right now. The full message is here to read.");
      }} />
      {available && (
        <aside className={`mizu ${open ? "mizu--open" : ""} ${playing ? "mizu--speaking" : ""}`} aria-label="Mizu site guide">
          {open && (
            <section className="mizu__panel" ref={panelRef} id="mizu-panel" role="region" aria-labelledby="mizu-title"
              onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); dock(true); } }}>
              <header className="mizu__header">
                <div><span className="mizu__eyebrow">YOUR LITTLE SAMURAI GUIDE</span><h2 id="mizu-title">A small step, together.</h2></div>
                <button className="mizu__icon" aria-label="Minimize Mizu" onClick={() => dock(true)}>×</button>
              </header>
              <div className="mizu__body">
                <div className="mizu__portrait">
                  <img src={`${ASSETS}images/mizu-guide.webp`} alt="Mizu, a smiling chibi samurai waving with a glowing lantern" width="320" height="480" />
                  <span className="mizu__name"><i /> Mizu <span>水</span></span>
                </div>
                <div className="mizu__conversation" role="log" aria-live="polite" aria-atomic="true">
                  {question && <p className="mizu__question">You: {question}</p>}
                  <p className="mizu__message">{intro
                    ? "Konnichiwa! I’m Mizu. Welcome to Shadow Quest — turn real goals into daily quests, find your focus, and build your streak. Start small. I’ll be in the corner, cheering you on!"
                    : reply.text}</p>
                  {intro && <details className="mizu__transcript"><summary>Read full welcome</summary><p>{reply.text}</p></details>}
                </div>
              </div>
              <div className="mizu__voice-row">
                <button className="mizu__listen" disabled={!reply.audio} onClick={() => {
                  if (playing) stopAudio();
                  else { setMuted(false); saveSetting(MUTED_KEY, false); void speak(topic); }
                }}><span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span> {playing ? "Pause voice" : intro ? "Hear my welcome" : "Listen"}</button>
                <button className="mizu__mute" aria-pressed={muted} onClick={() => {
                  stopAudio(); setMuted(!muted); saveSetting(MUTED_KEY, !muted);
                }}>{muted ? "Voice off" : "Voice on"}</button>
              </div>
              {audioError && <p className="mizu__error" role="status">{audioError}</p>}
              {intro ? (
                <div className="mizu__intro-actions">
                  <button className="mizu__primary" onClick={() => { dock(); onEnter(); }}>Start my first quest <span aria-hidden="true">↗</span></button>
                  <button className="mizu__quiet" onClick={() => dock(true)}>I’ll explore — stay nearby</button>
                </div>
              ) : (
                <>
                  <div className="mizu__topics">{TOPICS.map(({ topic: next, label }) => (
                    <button key={next} onClick={() => answer(next, label)}>{label}</button>
                  ))}</div>
                  <form className="mizu__form" onSubmit={submit}>
                    <label className="sr-only" htmlFor="mizu-message">Ask Mizu about Shadow Quest</label>
                    <input ref={inputRef} id="mizu-message" value={input} onChange={(event) => setInput(event.target.value)} maxLength={240} autoComplete="off" placeholder="Ask about tasks, focus, streaks…" />
                    <button type="submit" aria-label="Send message to Mizu" disabled={!input.trim()}>↑</button>
                  </form>
                  <button className="mizu__app-link" onClick={() => { dock(); onEnter(); }}>Open Shadow Quest ↗</button>
                </>
              )}
              <footer className="mizu__disclosure">Original mascot · AI-generated voice · Scripted, not an LLM</footer>
            </section>
          )}
          <button ref={launcherRef} className="mizu__launcher" aria-label={open ? "Minimize Mizu guide" : "Chat with Mizu"} aria-expanded={open} aria-controls={open ? "mizu-panel" : undefined}
            onClick={() => {
              if (open) dock(true);
              else { setOpen(true); setIntro(false); setTopic("hello"); setQuestion(""); setAudioError(""); }
            }}>
            <img src={`${ASSETS}images/mizu-guide.webp`} alt="" width="52" height="60" />
            <span>{open ? "Here for you" : "Ask Mizu"}<small><i /> {playing ? "Speaking…" : "One step at a time"}</small></span>
            <span className="mizu__launcher-mark" aria-hidden="true">{open ? "−" : "+"}</span>
          </button>
        </aside>
      )}
    </>
  );
}
