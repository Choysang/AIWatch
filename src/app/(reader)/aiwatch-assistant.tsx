"use client";

import { useState, useTransition } from "react";

const DEFAULT_QUESTION = "今天 AI 圈怎么读？";

export function AiWatchAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [answer, setAnswer] = useState("可以问我今天重点、某家公司动态、主题板怎么用，或让它帮你规划阅读路径。");
  const [isPending, startTransition] = useTransition();

  function ask() {
    const q = question.trim();
    if (!q) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q }),
        });
        if (!res.ok) throw new Error("assistant failed");
        const data = (await res.json()) as { answer?: string };
        setAnswer(data.answer ?? "暂时没有拿到可用回答。");
      } catch {
        setAnswer("AI 管家暂时不可用，请稍后再试。");
      }
    });
  }

  return (
    <aside className={`aiwatch-assistant ${open ? "is-open" : ""}`} aria-label="AIWatch AI 管家">
      <button
        type="button"
        className="aiwatch-assistant-toggle"
        onClick={() => setOpen((value) => !value)}
        title="询问 AIWatch 管家"
      >
        AI
      </button>
      {open ? (
        <div className="aiwatch-assistant-panel">
          <div className="aiwatch-assistant-head">
            <strong>AIWatch 管家</strong>
            <button type="button" onClick={() => setOpen(false)} title="收起 AI 管家">
              ×
            </button>
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            aria-label="向 AIWatch 管家提问"
          />
          <button type="button" onClick={ask} disabled={isPending} title="根据当前资讯生成回答">
            {isPending ? "思考中..." : "提问"}
          </button>
          <p>{answer}</p>
        </div>
      ) : null}
    </aside>
  );
}
