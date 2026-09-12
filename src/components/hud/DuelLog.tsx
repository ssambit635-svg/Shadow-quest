/**
 * DuelLog.tsx — the fight sheet.
 *
 * The server (or the mock) sends pre-written sentences, so the UI never
 * reassembles a sentence from numbers; it only decides how loudly each line
 * arrives. New lines push the paper down and settle on the shared curve.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { LogEntry } from "../../api/types";
import { gsap, REDUCED } from "../../lib/motion";

export function DuelLog({ log, note }: { log: LogEntry[]; note?: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const seenRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log.length]);

  // Animate only the entries that are actually new — never a re-render echo.
  useEffect(() => {
    const list = listRef.current;
    if (REDUCED || !list) return;

    const last = log[log.length - 1]?.id ?? null;
    if (last === seenRef.current) return;
    const prevIdx = seenRef.current ? log.findIndex((l) => l.id === seenRef.current) : -1;
    seenRef.current = last;

    const freshCount = log.length - (prevIdx + 1);
    if (freshCount <= 0) return;

    const nodes = Array.from(list.children as HTMLCollectionOf<HTMLLIElement>).slice(-freshCount);
    gsap.fromTo(
      nodes,
      { yPercent: 90, autoAlpha: 0 },
      {
        yPercent: 0,
        autoAlpha: 1,
        duration: 0.5,
        ease: "brush",
        stagger: 0.05,
        clearProps: "all",
      },
    );
  }, [log]);

  return (
    <div className="log">
      <div className="log__head">
        <span className="label">exchange log</span>
        <span className="log__count num">{String(log.length).padStart(3, "0")}</span>
      </div>

      <ul className="log__list" ref={listRef}>
        {log.map((l) => (
          <li className="log__row" data-kind={l.kind} key={l.id}>
            <span className="log__turn num">{String(l.turn).padStart(2, "0")}</span>
            <span className="log__text">{l.text}</span>
          </li>
        ))}
        {log.length === 0 && (
          <li className="log__row log__row--empty">
            <span className="log__text">nothing spent yet</span>
          </li>
        )}
      </ul>

      {note && <p className="log__note">{note}</p>}
    </div>
  );
}
