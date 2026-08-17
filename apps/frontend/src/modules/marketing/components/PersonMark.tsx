/**
 * A person, drawn in Potriv's language.
 *
 * The rule this encodes: Potriv shows people, but as technical editorial
 * geometry rather than illustration. A circle for the head and a shoulder arc,
 * monoline, no face. No expression, no hair, no skin — partly because none of
 * it carries information, and mostly because the moment a figure has a face it
 * becomes a character, and the page stops being about staffing.
 *
 * It renders a `<g>` rather than its own `<svg>`, because every use is *inside*
 * an existing diagram: the hero flow, the closing motif, and later a Team Finder
 * row. Nesting an `<svg>` per mark would create a viewport per person and make
 * them impossible to place in the parent's coordinate space. `transform` does
 * the positioning instead, so one definition serves every scale.
 *
 * Colour is not set here. The caller supplies `stroke` and `fill` through a
 * class or a parent `<g>`, so a person takes the tone of its context — charcoal
 * in a neutral row, brand teal when selected — and the human layer never
 * introduces a palette of its own.
 *
 * Always decorative: a person mark sits beside a name that already says who it
 * is, so it adds no information for a screen reader to miss.
 */

export type PersonMarkProps = {
  /** Centre of the head, in the parent SVG's coordinate space. */
  readonly x: number;
  readonly y: number;
  /** 1 draws roughly a 10×14 unit figure. */
  readonly scale?: number;
  readonly className?: string;
};

export function PersonMark({ x, y, scale = 1, className }: PersonMarkProps) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="-2.4" r="2.6" />
      {/* Shoulders as an arc — the figure stops before it becomes a body. */}
      <path d="M-5 6.4a5 5 0 0 1 10 0" />
    </g>
  );
}
