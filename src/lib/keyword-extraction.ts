import type { D1Database } from "@cloudflare/workers-types";
import { removeStopwords, eng } from "stopword";
import { createLogger } from "./logger";

const log = createLogger("email");

const BOILERPLATE = new Set([
  "dear", "hi", "hello", "hey", "greetings", "good", "morning", "afternoon",
  "best", "regards", "sincerely", "thanks", "thank", "please", "appreciate",
  "appreciated", "yours", "truly", "cheers", "kindly", "hope", "hoping",
  "looking", "forward", "hear", "soon", "feel", "free", "reach", "contact",
  "questions", "let", "know", "warm", "wishes", "sincerely", "welcome", "again",
]);

export function extractTermCounts(text: string): Map<string, number> {
  const tokens = text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) ?? [];
  const filtered = tokens.filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  const counts = new Map<string, number>();
  for (const token of removeStopwords(filtered, eng)) {
    if (BOILERPLATE.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export async function recordTerms(db: D1Database | undefined, termCounts: Map<string, number>) {
  if (!db || termCounts.size === 0) return;
  const stmt = db
    .prepare(
      "INSERT INTO term_counts (term, doc_count, term_count) VALUES (?1, 1, ?2) " +
        "ON CONFLICT(term) DO UPDATE SET doc_count = doc_count + 1, term_count = term_count + ?2",
    );
  const entries = [...termCounts.entries()];
  try {
    for (let i = 0; i < entries.length; i += 100) {
      await db.batch(entries.slice(i, i + 100).map(([term, count]) => stmt.bind(term, count)));
    }
  } catch (err) {
    log.error({ component: "d1", event: "terms_record_failed", error: String(err) });
  }
}
