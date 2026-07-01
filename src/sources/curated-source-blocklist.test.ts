import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const disabledNames = [
  "llama.cpp Releases",
  "Simon Willison",
  "Harrison Chase",
  "Clement Delangue",
  "swyx",
  "Jerry Liu",
  "Cloudflare Blog",
  "hermes-desktop Releases",
  "Hugging Face Blog",
  "Artificial Intelligence News",
  "Logan Kilpatrick",
  "Open WebUI Releases",
  "Together AI",
  "Thomas Wolf",
  "MarkTechPost",
  "量子位",
  "TechCrunch AI",
  "Ollama Releases",
  "Latent Space",
  "ComfyUI Releases",
  "Anyscale",
  "Jason Liu",
  "Replit",
  "CrewAI Releases",
  "Ars Technica AI",
  "MIT Technology Review AI",
  "LangGraph Releases",
  "Lilian Weng Blog",
].map((name) => name.toLowerCase());

describe("curated source blocklist", () => {
  test("keeps owner-disabled noisy sources out of the curated seed list", () => {
    const raw = readFileSync(join(import.meta.dir, "..", "..", "data", "sources", "curated_ai_sources.json"), "utf8");
    const sources = JSON.parse(raw) as Array<{ name?: string }>;
    const names = new Set(sources.map((source) => source.name?.toLowerCase()).filter(Boolean));
    for (const name of disabledNames) {
      expect(names.has(name)).toBe(false);
    }
  });
});
