"use client";

/**
 * Floating "back to top" control. Fixed at the page's lower-right corner and
 * smooth-scrolls to the top on click (instant under prefers-reduced-motion).
 */
export function BackToTop() {
  const scrollToTop = () => {
    const prefersReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
  };

  return (
    <>
      <button
        type="button"
        className="back-to-top"
        aria-label="回到顶部"
        aria-describedby="back-to-top-tooltip"
        onClick={scrollToTop}
      >
        <svg
          className="back-to-top-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 20V5M5.5 11.5 12 5l6.5 6.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span id="back-to-top-tooltip" className="back-to-top-tooltip" role="tooltip">
          回到顶部
        </span>
      </button>
      <style>{`
        .back-to-top {
          position: fixed;
          right: clamp(1rem, 2.4vw, 2rem);
          bottom: clamp(1rem, 2.4vw, 2rem);
          z-index: 90;
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(43, 55, 78, 0.94);
          color: rgba(190, 202, 224, 0.78);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
          cursor: pointer;
          transition: background 150ms ease, border-color 150ms ease,
            color 150ms ease, transform 150ms ease;
        }
        .back-to-top:hover {
          color: rgba(245, 248, 255, 0.96);
          border-color: rgba(255, 255, 255, 0.24);
          background: rgba(50, 64, 91, 0.98);
        }
        .back-to-top:focus-visible {
          outline: 2px solid var(--accent, #6aa8ff);
          outline-offset: 2px;
        }
        .back-to-top:active {
          transform: translateY(1px);
        }
        .back-to-top-tooltip {
          position: absolute;
          right: calc(100% + 0.65rem);
          top: 50%;
          padding: 0.38rem 0.58rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: rgba(13, 16, 24, 0.96);
          color: rgba(245, 248, 255, 0.96);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
          font-size: 0.76rem;
          font-weight: 700;
          line-height: 1.2;
          opacity: 0;
          pointer-events: none;
          transform: translate(4px, -50%);
          transition: opacity 120ms ease, transform 120ms ease;
          white-space: nowrap;
        }
        .back-to-top:hover .back-to-top-tooltip,
        .back-to-top:focus-visible .back-to-top-tooltip {
          opacity: 1;
          transform: translate(0, -50%);
        }
        html[data-reader-theme="light"] .back-to-top {
          border-color: rgba(22, 31, 48, 0.12);
          background: rgba(236, 241, 250, 0.94);
          color: rgba(56, 69, 96, 0.78);
          box-shadow: 0 14px 32px rgba(30, 38, 58, 0.16);
        }
        html[data-reader-theme="light"] .back-to-top:hover {
          color: rgba(24, 32, 48, 0.95);
          border-color: rgba(22, 31, 48, 0.22);
          background: rgba(248, 250, 255, 0.98);
        }
        html[data-reader-theme="light"] .back-to-top-tooltip {
          border-color: rgba(22, 31, 48, 0.12);
          background: rgba(248, 250, 255, 0.98);
          color: rgba(24, 32, 48, 0.95);
          box-shadow: 0 12px 28px rgba(30, 38, 58, 0.14);
        }
        @media (prefers-reduced-motion: reduce) {
          .back-to-top,
          .back-to-top:active {
            transition: none;
            transform: none;
          }
          .back-to-top-tooltip {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
