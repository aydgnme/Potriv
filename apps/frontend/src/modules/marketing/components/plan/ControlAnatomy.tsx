import pages from "../../styles/pages.module.css";

/**
 * What a control claim on this page is made of.
 *
 * Every entry below states three things and never fewer: what the product
 * enforces, how a reader can check it, and where the claim stops. The third is
 * the one a security page usually omits, so the shape is drawn before the
 * entries begin — a reader who knows to expect a limitation will notice if one
 * is ever missing.
 *
 * Drawn with the ground variables rather than palette entries, so the same
 * component reads correctly on this page's charcoal and would read correctly on
 * a light one. Decorative: the three parts are labelled in the entries beneath.
 */
export function ControlAnatomy() {
  return (
    <figure className={pages.anatomy}>
      <svg className={pages.anatomyDrawing} viewBox="0 0 640 132" aria-hidden="true">
        <Part x={0} label="CONTROL" title="What is enforced" detail="a behaviour of the product" />
        <path className={pages.anatomyLine} d="M196 60 H228" />

        <Part x={212} label="EVIDENCE" title="How you can check it" detail="something observable" />
        <path className={pages.anatomyLine} d="M408 60 H440" />

        {/*
          Dashed, because this is where the claim stops rather than another thing
          being asserted — the same grammar the rest of the site uses for
          something that is not yet, or not, a fact.
        */}
        <Part
          x={424}
          label="LIMITATION"
          title="What it does not claim"
          detail="the edge of the statement"
          bounded
        />
      </svg>

      <figcaption className={pages.anatomyCaption}>
        Every entry below carries all three. A control without a limitation is a claim.
      </figcaption>
    </figure>
  );
}

function Part({
  x,
  label,
  title,
  detail,
  bounded,
}: {
  readonly x: number;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly bounded?: boolean;
}) {
  return (
    <g>
      <text className={pages.anatomyStage} x={x + 14} y="22">
        {label}
      </text>
      <rect
        className={bounded ? pages.anatomyNodeBounded : pages.anatomyNode}
        x={x + 12}
        y="32"
        width="184"
        height="56"
        rx="3"
      />
      <text className={pages.anatomyTitle} x={x + 26} y="58">
        {title}
      </text>
      <text className={pages.anatomyDetail} x={x + 26} y="76">
        {detail}
      </text>
    </g>
  );
}
