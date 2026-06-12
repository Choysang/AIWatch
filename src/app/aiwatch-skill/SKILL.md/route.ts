// GET /aiwatch-skill/SKILL.md — serves the static Skill file as markdown (decision 13).
// Quasi-static: long cache, no feed data embedded.

import { SKILL_MD } from "@/public/skill-md";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(SKILL_MD, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
