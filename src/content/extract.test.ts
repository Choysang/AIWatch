import { describe, expect, test } from "bun:test";
import { extractReadableText, isSafeFetchUrl } from "./extract";

describe("isSafeFetchUrl", () => {
  test("accepts public http(s) urls", () => {
    expect(isSafeFetchUrl("https://openai.com/blog/x")).toBe(true);
    expect(isSafeFetchUrl("http://example.com")).toBe(true);
  });

  test("rejects non-http(s) schemes and garbage", () => {
    expect(isSafeFetchUrl("ftp://example.com/x")).toBe(false);
    expect(isSafeFetchUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeFetchUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeFetchUrl("not a url")).toBe(false);
  });

  test("rejects internal / private / loopback / link-local hosts (SSRF guard)", () => {
    for (const url of [
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://10.0.0.5/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/x",
      "http://service.internal/x",
    ]) {
      expect(isSafeFetchUrl(url), url).toBe(false);
    }
  });
});

describe("extractReadableText", () => {
  const article = `<!doctype html><html><head><title>T</title></head><body>
    <nav>Home About Contact Subscribe Login</nav>
    <article>
      <h1>Transformers explained</h1>
      <p>The transformer architecture replaced recurrence with self-attention, letting a model weigh every token against every other token in parallel rather than stepping through a sequence one position at a time. This made large-scale pretraining practical on modern accelerators.</p>
      <p>Subsequent work scaled the same recipe to hundreds of billions of parameters, and the core attention mechanism remained largely unchanged across model families even as data, context length, and training budgets grew by orders of magnitude.</p>
      <p>The lasting lesson was architectural simplicity: one repeated block, trained at scale, generalized further than the more elaborate designs it displaced.</p>
    </article>
    <footer>Copyright 2026 Example Inc. All rights reserved.</footer>
  </body></html>`;

  test("extracts the main article body", () => {
    const result = extractReadableText(article);
    expect(result.status).toBe("ok");
    expect(result.text).toContain("self-attention");
    expect(result.text).toContain("architectural simplicity");
  });

  test("returns empty when there is no substantial article", () => {
    const result = extractReadableText("<html><body><p>hi</p></body></html>");
    expect(result.status).toBe("empty");
    expect(result.text).toBe("");
  });
});
