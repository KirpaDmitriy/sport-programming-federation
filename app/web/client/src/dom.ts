type ElementClass<E extends Element> = abstract new (...args: never[]) => E;

export function $(selector: string, root?: ParentNode): HTMLElement;
export function $<E extends Element>(selector: string, type: ElementClass<E>, root?: ParentNode): E;
export function $(selector: string, typeOrRoot?: ElementClass<Element> | ParentNode, root?: ParentNode): Element {
  const type = typeof typeOrRoot === 'function' ? typeOrRoot : HTMLElement;
  const scope = (typeof typeOrRoot === 'function' ? root : typeOrRoot) ?? document;
  const element = scope.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Element not found: ${selector}`);
  return element;
}

export function $$(selector: string, root?: ParentNode): HTMLElement[];
export function $$<E extends Element>(selector: string, type: ElementClass<E>, root?: ParentNode): E[];
export function $$(selector: string, typeOrRoot?: ElementClass<Element> | ParentNode, root?: ParentNode): Element[] {
  const type = typeof typeOrRoot === 'function' ? typeOrRoot : HTMLElement;
  const scope = (typeof typeOrRoot === 'function' ? root : typeOrRoot) ?? document;
  return [...scope.querySelectorAll(selector)].filter((element) => element instanceof type);
}

export function dataOf(element: HTMLElement, key: string): string {
  const value = element.dataset[key];
  if (value === undefined) throw new Error(`Missing data attribute: ${key}`);
  return value;
}

export function field<E extends Element>(form: HTMLFormElement, name: string, type: ElementClass<E>): E {
  const element = form.elements.namedItem(name);
  if (!(element instanceof type)) throw new Error(`Form field not found: ${name}`);
  return element;
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]));
}

export function formReader(form: HTMLFormElement): (name: string) => string {
  const data = new FormData(form);
  return (name) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
}

export function setStatus(form: HTMLFormElement, message: string): void {
  $('.form-status', form).textContent = message;
}

export function toast(message: string): void {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2600);
}
