/**
 * Fit a word to its plate using the variable font's width axis.
 *
 * Road signage solves this by drawing the board to fit the text. On a phone the
 * board is fixed, so the type has to give — Archivo's wdth axis condenses
 * Geschwindigkeitsbegrenzung into the same slot that holds Haus, at the same
 * optical weight. Scaling font-size instead would make long words visually
 * quieter than short ones, which is exactly backwards.
 */
export function fit(node: HTMLElement, _dep?: unknown) {
  const MIN = 62;
  const MAX = 125;

  // A block element's scrollWidth can report its own box width rather than the
  // exact glyph width on some mobile browsers. Measuring the text range gives
  // us the rendered word width directly, including variable-font changes.
  const renderedTextWidth = () => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width;
  };

  const apply = () => {
    const box = node.parentElement;
    if (!box) return;

    node.style.fontSize = '';

    // The word is a block that fills the plate's content box, so clientWidth is
    // the actual horizontal space available after the plate's padding/borders.
    const available = node.clientWidth || box.clientWidth;
    if (available <= 0) return;

    let lo = MIN;
    let hi = MAX;
    let best = MIN;

    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      node.style.setProperty('--w', String(mid));
      if (renderedTextWidth() <= available) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    node.style.setProperty('--w', best.toFixed(1));

    // Even fully condensed some compounds will not fit; then, and only then,
    // fall back to reducing the size.
    const width = renderedTextWidth();
    if (width > available) {
      const size = parseFloat(getComputedStyle(node).fontSize);
      node.style.fontSize = `${(size * available) / width}px`;
    }
  };

  const observer = new ResizeObserver(apply);
  if (node.parentElement) observer.observe(node.parentElement);

  if (document.fonts?.status === 'loaded') requestAnimationFrame(apply);
  else document.fonts?.ready.then(() => requestAnimationFrame(apply));
  apply();

  return {
    update: () => requestAnimationFrame(apply),
    destroy: () => observer.disconnect()
  };
}
