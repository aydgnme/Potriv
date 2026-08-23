import Link from "next/link";

import { PLAN_CHAPTERS } from "../../businessPlan";
import { CHAPTER_PREVIEWS, type PreviewKind } from "../../homeModel";
import home from "../../styles/home.module.css";

/**
 * The four chapters as an index with a preview, not four cards.
 *
 * A card grid gives each chapter the same shape and says nothing about what is
 * inside it. This keeps the list as a list — reading order preserved, one line
 * per chapter — and shows what a chapter contains in a panel beside it.
 *
 * No client component. The preview follows hover and keyboard focus through
 * `:has()`, so which panel is showing is a CSS state rather than React state:
 * the page stays server-rendered, nothing waits on hydration, and the keyboard
 * behaviour is the same code path as the pointer one rather than a second
 * implementation that can drift.
 *
 * Below the two-column breakpoint the preview panel is not rendered to the
 * reader at all. It is a hover affordance, and there is no hover on a phone;
 * every chapter's number, label, question and summary is in the row itself, so
 * nothing is lost with it gone.
 */
export function ChapterIndex() {
  return (
    <div className={home.chapters}>
      <ol className={home.chapterList}>
        {PLAN_CHAPTERS.map((chapter) => (
          <li className={home.chapterItem} key={chapter.href}>
            <Link className={home.chapterRow} href={chapter.href}>
              <span className={home.chapterNumber} aria-hidden="true">
                {chapter.number}
              </span>
              <span className={home.chapterBody}>
                <span className={home.chapterLabel}>{chapter.label}</span>
                <span className={home.chapterQuestion}>{chapter.question}</span>
              </span>
              <span className={home.chapterArrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {/*
        Decorative by construction: every preview restates what the row beside
        it already says, so it is hidden from assistive technology rather than
        read out four times.
      */}
      <div className={home.chapterPreviews} aria-hidden="true">
        {PLAN_CHAPTERS.map((chapter) => {
          const preview = CHAPTER_PREVIEWS[chapter.href];
          if (!preview) return null;
          return (
            <div className={home.chapterPreview} key={chapter.href}>
              <p className={home.chapterPreviewCaption}>{preview.caption}</p>
              <PreviewDrawing kind={preview.kind} lines={preview.lines} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One micro-diagram per chapter, drawn from the chapter's own labels. */
function PreviewDrawing({
  kind,
  lines,
}: {
  readonly kind: PreviewKind;
  readonly lines: readonly string[];
}) {
  if (kind === "objects") {
    return (
      <svg className={home.previewDrawing} viewBox="0 0 320 168" aria-hidden="true">
        {lines.map((line, index) => {
          const y = 18 + index * 30;
          return (
            <g key={line}>
              <rect className={home.previewNode} x="60" y={y} width="200" height="22" rx="3" />
              <text className={home.previewLabel} x="72" y={y + 15}>
                {line}
              </text>
              {index < lines.length - 1 ? (
                <line className={home.previewLine} x1="48" y1={y + 11} x2="48" y2={y + 41} />
              ) : null}
              <circle className={home.previewDot} cx="48" cy={y + 11} r="3" />
            </g>
          );
        })}
      </svg>
    );
  }

  if (kind === "flow") {
    return (
      <svg className={home.previewDrawing} viewBox="0 0 320 168" aria-hidden="true">
        {lines.map((line, index) => {
          const y = 14 + index * 29;
          const last = index === lines.length - 1;
          return (
            <g key={line}>
              {index > 0 ? (
                <line
                  className={last ? home.previewAccepted : home.previewLine}
                  x1="24"
                  y1={y - 18}
                  x2="24"
                  y2={y + 6}
                />
              ) : null}
              <circle
                className={last ? home.previewDotFilled : home.previewDot}
                cx="24"
                cy={y + 8}
                r="4"
              />
              <text className={home.previewLabel} x="42" y={y + 12}>
                {line}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  if (kind === "lanes") {
    return (
      <svg className={home.previewDrawing} viewBox="0 0 320 168" aria-hidden="true">
        {lines.map((line, index) => {
          const y = 16 + index * 36;
          return (
            <g key={line}>
              <text className={home.previewLabel} x="12" y={y + 12}>
                {line}
              </text>
              <line className={home.previewLine} x1="12" y1={y + 22} x2="308" y2={y + 22} />
              <rect
                className={index === 1 ? home.previewNodeStrong : home.previewNode}
                x={160 + index * 24}
                y={y}
                width="56"
                height="16"
                rx="3"
              />
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <svg className={home.previewDrawing} viewBox="0 0 320 168" aria-hidden="true">
      {lines.map((line, index) => {
        const y = 20 + index * 48;
        return (
          <g key={line}>
            <rect className={home.previewNode} x="12" y={y} width="296" height="34" rx="3" />
            <text className={home.previewLabel} x="26" y={y + 22}>
              {line}
            </text>
            <line
              className={home.previewLine}
              x1="12"
              y1={y + 17}
              x2={index === 2 ? 12 : 26}
              y2={y + 17}
            />
          </g>
        );
      })}
    </svg>
  );
}
