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

  const apply = () => {
    const box = node.parentElement;
    if (!box) return;
    const available = box.clientWidth - 2;
    if (available <= 0) return;

    node.style.fontSize = '';
    let lo = MIN;
    let hi = MAX;
    let best = MIN;

    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      node.style.setProperty('--w', String(mid));
      if (node.scrollWidth <= available) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    node.style.setProperty('--w', best.toFixed(1));

    // Even fully condensed some compounds will not fit; then, and only then,
    // fall back to reducing the size.
    if (node.scrollWidth > available) {
      const size = parseFloat(getComputedStyle(node).fontSize);
      node.style.fontSize = `${(size * available) / node.scrollWidth}px`;
    }
  };

  const observer = new ResizeObserver(apply);
  if (node.parentElement) observer.observe(node.parentElement);

  if (document.fonts?.status === 'loaded') apply();
  else document.fonts?.ready.then(apply);
  apply();

  return {
    update: apply,
    destroy: () => observer.disconnect()
  };
}
