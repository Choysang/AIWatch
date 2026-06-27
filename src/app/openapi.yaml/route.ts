import { OPENAPI_YAML } from "@/public/openapi";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return new Response(OPENAPI_YAML, {
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
