// Derives a "brand accent" for an event from its source / title / tags so the reader
// homepage can tint each card's spotlight glow and stamp a monospace model tag
// (e.g. `[ DEEPSEEK ]`). Pure + deterministic — no data layer, no side effects.
// Colors are stored as space-separated RGB channels so CSS can do `rgb(var(--accent) / a)`.

export interface ModelAccent {
  /** Stable key for the matched model/lab. */
  key: string;
  /** Uppercase monospace label rendered in the card tag, e.g. "DEEPSEEK". */
  label: string;
  /** RGB channels as "R G B" for `rgb(var(--card-accent) / <alpha>)`. */
  rgb: string;
}

interface AccentRule {
  key: string;
  label: string;
  rgb: string;
  // Lowercased keywords matched against source name + title + tags.
  match: string[];
}

// Ordered by specificity: more distinctive names first so "gpt" doesn't shadow a
// more specific brand mentioned alongside it.
const RULES: AccentRule[] = [
  { key: "deepseek", label: "DEEPSEEK", rgb: "77 107 254", match: ["deepseek"] },
  { key: "claude", label: "CLAUDE", rgb: "217 119 87", match: ["claude", "anthropic"] },
  { key: "gemini", label: "GEMINI", rgb: "66 133 244", match: ["gemini", "google deepmind"] },
  { key: "kimi", label: "KIMI", rgb: "255 90 90", match: ["kimi", "moonshot"] },
  { key: "grok", label: "GROK", rgb: "224 224 235", match: ["grok", "xai", "x.ai"] },
  { key: "qwen", label: "QWEN", rgb: "162 89 197", match: ["qwen", "通义", "tongyi"] },
  { key: "llama", label: "LLAMA", rgb: "64 110 230", match: ["llama", "meta ai"] },
  { key: "mistral", label: "MISTRAL", rgb: "255 132 47", match: ["mistral"] },
  { key: "openai", label: "OPENAI", rgb: "16 163 127", match: ["openai", "gpt", "chatgpt", "o1", "o3"] },
  { key: "hn", label: "HACKERNEWS", rgb: "255 122 41", match: ["hacker news", "hackernews"] },
];

const DEFAULT_ACCENT: ModelAccent = { key: "signal", label: "SIGNAL", rgb: "126 142 184" };

interface AccentInput {
  sourceName?: string | null;
  title?: string | null;
  tags?: readonly string[] | null;
}

/** Best-effort brand accent for a card. Falls back to a neutral slate "SIGNAL" tag. */
export function modelAccent(event: AccentInput): ModelAccent {
  const haystack = [event.sourceName ?? "", event.title ?? "", ...(event.tags ?? [])]
    .join(" ")
    .toLowerCase();

  for (const rule of RULES) {
    if (rule.match.some((kw) => haystack.includes(kw))) {
      return { key: rule.key, label: rule.label, rgb: rule.rgb };
    }
  }
  return DEFAULT_ACCENT;
}
