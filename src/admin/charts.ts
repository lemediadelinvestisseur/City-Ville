/** Petits graphiques SVG sans dépendance (barres et courbes). */

const NS = 'http://www.w3.org/2000/svg';

function svg(width: number, height: number): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('class', 'chart');
  el.setAttribute('preserveAspectRatio', 'none');
  return el;
}

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

export interface Series {
  label: string;
  color: string;
  values: number[];
}

/** Barres groupées par jour (plusieurs séries) avec info-bulle native. */
export function barChart(labels: string[], series: Series[], height = 160): SVGSVGElement {
  const width = 600;
  const el = svg(width, height);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const slot = width / Math.max(1, labels.length);
  const barW = (slot * 0.8) / series.length;
  labels.forEach((label, i) => {
    series.forEach((s, j) => {
      const value = s.values[i] ?? 0;
      const h = (value / max) * (height - 18);
      const rect = node('rect', {
        x: i * slot + slot * 0.1 + j * barW,
        y: height - 14 - h,
        width: Math.max(1, barW - 1),
        height: h,
        rx: 2,
        fill: s.color,
      });
      const title = node('title', {});
      title.textContent = `${label} — ${s.label} : ${Math.round(value * 10) / 10}`;
      rect.append(title);
      el.append(rect);
    });
    if (labels.length <= 31 && (i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1)) {
      const text = node('text', {
        x: i * slot + slot / 2,
        y: height - 2,
        'text-anchor': 'middle',
        class: 'chart__label',
      });
      text.textContent = label;
      el.append(text);
    }
  });
  return el;
}

/** Courbe simple. */
export function lineChart(labels: string[], values: number[], color: string, height = 120): SVGSVGElement {
  const width = 600;
  const el = svg(width, height);
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - 14 - (v / max) * (height - 22)}`);
  el.append(
    node('polyline', {
      points: points.join(' '),
      fill: 'none',
      stroke: color,
      'stroke-width': 3,
      'stroke-linejoin': 'round',
    }),
  );
  values.forEach((v, i) => {
    const [x, y] = (points[i] ?? '0,0').split(',');
    const dot = node('circle', { cx: x ?? 0, cy: y ?? 0, r: 3.5, fill: color });
    const title = node('title', {});
    title.textContent = `${labels[i] ?? ''} : ${Math.round(v * 10) / 10}`;
    dot.append(title);
    el.append(dot);
  });
  return el;
}
