// Small tooltip for anything with a data-tip attribute: the Multi switch, the season button and the Multi cells of the
// table (header tooltips are tooltip.js). Hover or keyboard focus on a computer, a tap on a touch screen.
// An element may carry data-tip-href: the tooltip then ends with a "Glossary" link to it.
import { escapeHtml } from './text.js?v=5f3ae5be70';

const HIDE_DELAY_MS = 180;     // lets the pointer travel from the element to a link in the tooltip
const TOUCH_SHOW_MS = 3000;    // a touch screen has no pointer leaving, so the tooltip closes by itself
const NO_HOVER = window.matchMedia('(hover: none)');   // keep in step with the @media (hover: none) rule in css/site.css

export function setUpHint(hintElement) {
  let hideTimer = null;

  function show(target) {
    clearTimeout(hideTimer);
    const href = target.dataset.tipHref;
    hintElement.innerHTML = `<p>${escapeHtml(target.dataset.tip)}</p>` + (href ? `<a class="tip-link" href="${escapeHtml(href)}">Glossary &rarr;</a>` : '');
    hintElement.hidden = false;

    const anchor = target.getBoundingClientRect();
    const below = anchor.bottom + 6;
    const top = below + hintElement.offsetHeight > window.innerHeight - 8 ? Math.max(8, anchor.top - hintElement.offsetHeight - 6) : below;
    hintElement.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - hintElement.offsetWidth - 8))}px`;
    hintElement.style.top = `${top}px`;
    if (NO_HOVER.matches) hideTimer = setTimeout(hide, TOUCH_SHOW_MS);
  }

  function hide() {
    clearTimeout(hideTimer);
    hintElement.hidden = true;
  }

  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY_MS);
  }

  const tipTarget = (node) => node.closest?.('[data-tip]');

  document.addEventListener('mouseover', (event) => {
    const target = tipTarget(event.target);
    if (target && !NO_HOVER.matches) show(target);
  });
  document.addEventListener('mouseout', (event) => {
    if (tipTarget(event.target) && !NO_HOVER.matches) hideSoon();
  });
  document.addEventListener('focusin', (event) => {
    const target = tipTarget(event.target);
    if (target && event.target.matches(':focus-visible')) show(target);
  });
  document.addEventListener('focusout', (event) => { if (tipTarget(event.target)) hideSoon(); });
  hintElement.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  hintElement.addEventListener('mouseleave', hideSoon);
  document.addEventListener('click', (event) => {
    const target = tipTarget(event.target);
    if (target && NO_HOVER.matches) show(target);
    else if (!hintElement.contains(event.target)) hide();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });

  return { hide };
}
