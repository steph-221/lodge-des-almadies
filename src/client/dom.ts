// Mini-créateur de DOM (port TypeScript du h() de public/admin.js).
type Attrs = Record<string, string | boolean | null | undefined | ((e: Event) => void)>;
type Child = Node | string | null | false | undefined | Child[];

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class' && typeof v === 'string') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null && typeof v !== 'function') el.setAttribute(k, v === true ? '' : v);
  }
  const add = (list: Child[]) => {
    for (const ch of list) {
      if (ch == null || ch === false) continue;
      if (Array.isArray(ch)) add(ch);
      else el.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
  };
  add(children);
  return el;
}
