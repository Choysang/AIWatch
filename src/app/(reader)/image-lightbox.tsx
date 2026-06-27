"use client";

import { useEffect, useState } from "react";
import { messages } from "@/i18n";

export interface LightboxImage {
  src: string;
  alt?: string;
}

export function ImageLightbox({
  images,
  startIndex = 0,
  triggerClassName = "image-lightbox-trigger",
  imageClassName,
}: {
  images: LightboxImage[];
  startIndex?: number;
  triggerClassName?: string;
  imageClassName?: string;
}) {
  const safeImages = images.filter((image) => image.src);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, safeImages.length - 1)));
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const current = safeImages[index] ?? safeImages[0];
  const m = messages.card;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") setIndex((value) => (value === 0 ? safeImages.length - 1 : value - 1));
      if (event.key === "ArrowRight") setIndex((value) => (value + 1) % safeImages.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, safeImages.length]);

  if (!current) return null;

  async function copyImageLink() {
    try {
      await navigator.clipboard.writeText(current?.src ?? "");
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const hasMultiple = safeImages.length > 1;
  const goPrev = () => setIndex((value) => (value === 0 ? safeImages.length - 1 : value - 1));
  const goNext = () => setIndex((value) => (value + 1) % safeImages.length);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        data-tooltip={m.openImage}
        aria-label={m.openImage}
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied external media, unknown dimensions */}
        <img src={current.src} alt={current.alt ?? ""} className={imageClassName} loading="lazy" decoding="async" />
      </button>

      {open && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={m.openImage}>
          <button
            type="button"
            className="image-lightbox-backdrop"
            aria-label="关闭图片预览"
            data-tooltip="关闭图片预览"
            onClick={() => setOpen(false)}
          />
          <div className="image-lightbox-panel">
            <div className="image-lightbox-actions">
              <span>{hasMultiple ? `${index + 1} / ${safeImages.length}` : m.openImage}</span>
              <button type="button" onClick={copyImageLink} data-tooltip="复制当前图片链接">
                {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制链接"}
              </button>
              <a href={current.src} download data-tooltip="保存当前图片到本地">
                保存图片
              </a>
              <button type="button" onClick={() => setOpen(false)} data-tooltip="关闭图片预览">
                关闭
              </button>
            </div>
            <div className="image-lightbox-stage">
              {hasMultiple && (
                <button type="button" className="image-lightbox-nav prev" onClick={goPrev} data-tooltip="查看上一张图片">
                  ‹
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- viewer renders proxied external images */}
              <img src={current.src} alt={current.alt ?? ""} />
              {hasMultiple && (
                <button type="button" className="image-lightbox-nav next" onClick={goNext} data-tooltip="查看下一张图片">
                  ›
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
