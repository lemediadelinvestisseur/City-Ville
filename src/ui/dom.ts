/** Micro-utilitaire de création d'éléments DOM (sans framework). */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  /** HTML de confiance uniquement (icônes SVG internes). */
  html?: string;
  title?: string;
  attrs?: Record<string, string>;
  style?: string;
  onClick?: (event: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute('style', props.style);
  if (props.attrs) for (const [key, value] of Object.entries(props.attrs)) el.setAttribute(key, value);
  const onClick = props.onClick;
  if (onClick) el.addEventListener('click', (event) => onClick(event as MouseEvent));
  if (tag === 'button' && !props.attrs?.type) el.setAttribute('type', 'button');
  append(el, ...children);
  return el;
}

export function append(parent: HTMLElement, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'number' ? String(child) : child);
  }
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

/** Icône SVG interne (chaîne de confiance) dans un span. */
export function icon(svg: string, className = 'ico'): HTMLSpanElement {
  return h('span', { class: className, html: svg, attrs: { 'aria-hidden': 'true' } });
}
