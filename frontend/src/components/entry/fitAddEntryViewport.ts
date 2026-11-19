// Mobile keyboards can shrink the visual viewport without resizing fixed elements.
export function fitAddEntryViewport(sheet: HTMLElement, body: HTMLElement) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  let frame = 0;

  function fit() {
    if (!viewport || viewport.scale !== 1) return;
    const bottom = Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop);
    sheet.style.setProperty('--add-entry-viewport-height', `${viewport.height}px`);
    sheet.style.setProperty('--add-entry-viewport-bottom', `${bottom}px`);

    const focused = document.activeElement;
    if (!focused || !body.contains(focused)) return;
    const field = focused.getBoundingClientRect();
    const scrollport = body.getBoundingClientRect();
    if (field.bottom > scrollport.bottom) body.scrollTop += field.bottom - scrollport.bottom + 8;
    else if (field.top < scrollport.top) body.scrollTop -= scrollport.top - field.top + 8;
  }

  function scheduleFit() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  }

  fit();
  viewport.addEventListener('resize', scheduleFit);
  viewport.addEventListener('scroll', scheduleFit);
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', scheduleFit);
    viewport.removeEventListener('scroll', scheduleFit);
    sheet.style.removeProperty('--add-entry-viewport-height');
    sheet.style.removeProperty('--add-entry-viewport-bottom');
  };
}
