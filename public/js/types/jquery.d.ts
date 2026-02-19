/**
 * Minimal jQuery type definitions for Superengineer-v5
 * This provides basic typing for jQuery usage in the project
 */

interface JQueryAjaxSettings {
  url?: string;
  method?: string;
  type?: string;
  data?: any;
  contentType?: string;
  dataType?: string;
  success?: (data: any, textStatus: string, jqXHR: JQueryXHR) => void;
  error?: (jqXHR: JQueryXHR, textStatus: string, errorThrown: string) => void;
  complete?: (jqXHR: JQueryXHR, textStatus: string) => void;
}

interface JQueryXHR<T = any> extends JQuery.Promise<T> {
  status: number;
  statusText: string;
  responseText: string;
  responseJSON?: any;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  getAllResponseHeaders(): string;
  abort(): void;
  done(callback: (data: T, textStatus: string, jqXHR: JQueryXHR<T>) => void): JQueryXHR<T>;
  fail(callback: (jqXHR: JQueryXHR<T>, textStatus: string, errorThrown: string) => void): JQueryXHR<T>;
  always(callback: (dataOrJqXHR: any, textStatus: string, jqXHROrErrorThrown: any) => void): JQueryXHR<T>;
  then<U>(
    doneCallback: (data: T, textStatus: string, jqXHR: JQueryXHR<T>) => U | JQuery.Promise<U>,
    failCallback?: (jqXHR: JQueryXHR<T>, textStatus: string, errorThrown: string) => U | JQuery.Promise<U>
  ): JQuery.Promise<U>;
  catch<U>(
    failCallback: (error: any) => U | JQuery.Promise<U>
  ): JQuery.Promise<U>;
}

interface JQueryStatic {
  (selector: string | Element | Document | Window | JQuery): JQuery;
  ajax<T = any>(settings: JQueryAjaxSettings): JQueryXHR<T>;
  get<T = any>(url: string, data?: any, success?: Function, dataType?: string): JQueryXHR<T>;
  post<T = any>(url: string, data?: any, success?: Function, dataType?: string): JQueryXHR<T>;
  getJSON<T = any>(url: string, data?: any, success?: Function): JQueryXHR<T>;
  extend(target: any, ...sources: any[]): any;
  each<T>(array: T[], callback: (index: number, element: T) => void): T[];
  each(object: any, callback: (key: string, value: any) => void): any;
  map<T, U>(array: T[], callback: (element: T, index: number) => U): U[];
  grep<T>(array: T[], callback: (element: T, index: number) => boolean): T[];
  inArray<T>(value: T, array: T[], fromIndex?: number): number;
  isArray(obj: any): boolean;
  isFunction(obj: any): boolean;
  isPlainObject(obj: any): boolean;
  isEmptyObject(obj: any): boolean;
  type(obj: any): string;
  trim(str: string): string;
  now(): number;
}

interface JQuery {
  // DOM manipulation
  addClass(className: string): JQuery;
  removeClass(className: string): JQuery;
  toggleClass(className: string): JQuery;
  hasClass(className: string): boolean;
  attr(name: string): string | undefined;
  attr(name: string, value: string | number | boolean): JQuery;
  prop(name: string): any;
  prop(name: string, value: any): JQuery;
  val(): string;
  val(value: string | number | string[]): JQuery;
  text(): string;
  text(text: string | number | boolean): JQuery;
  html(): string;
  html(html: string): JQuery;
  empty(): JQuery;
  remove(): JQuery;
  append(content: string | Element | JQuery): JQuery;
  prepend(content: string | Element | JQuery): JQuery;
  before(content: string | Element | JQuery): JQuery;
  after(content: string | Element | JQuery): JQuery;
  appendTo(target: string | Element | JQuery): JQuery;
  prependTo(target: string | Element | JQuery): JQuery;
  insertBefore(target: string | Element | JQuery): JQuery;
  insertAfter(target: string | Element | JQuery): JQuery;
  wrap(wrapper: string | Element | JQuery): JQuery;
  unwrap(): JQuery;
  replaceWith(newContent: string | Element | JQuery): JQuery;
  clone(withDataAndEvents?: boolean): JQuery;

  // Traversal
  find(selector: string): JQuery;
  parent(selector?: string): JQuery;
  parents(selector?: string): JQuery;
  closest(selector: string): JQuery;
  next(selector?: string): JQuery;
  prev(selector?: string): JQuery;
  siblings(selector?: string): JQuery;
  children(selector?: string): JQuery;
  first(): JQuery;
  last(): JQuery;
  eq(index: number): JQuery;
  get(index?: number): Element | Element[];
  index(): number;
  index(element: Element | JQuery): number;
  filter(selector: string | Function): JQuery;
  not(selector: string | Element | JQuery): JQuery;
  is(selector: string | Element | JQuery): boolean;

  // CSS
  css(propertyName: string): string;
  css(propertyName: string, value: string | number): JQuery;
  css(properties: Record<string, string | number>): JQuery;
  width(): number;
  width(value: number | string): JQuery;
  height(): number;
  height(value: number | string): JQuery;
  offset(): { top: number; left: number } | undefined;
  position(): { top: number; left: number };
  scrollTop(): number;
  scrollTop(value: number): JQuery;
  scrollLeft(): number;
  scrollLeft(value: number): JQuery;

  // Events
  on(event: string, handler: Function): JQuery;
  on(event: string, selector: string, handler: Function): JQuery;
  off(event: string, handler?: Function): JQuery;
  off(event: string, selector: string, handler: Function): JQuery;
  one(event: string, handler: Function): JQuery;
  trigger(event: string, extraParameters?: any[]): JQuery;
  triggerHandler(event: string, extraParameters?: any[]): any;
  click(handler?: Function): JQuery;
  dblclick(handler?: Function): JQuery;
  mouseenter(handler?: Function): JQuery;
  mouseleave(handler?: Function): JQuery;
  mousedown(handler?: Function): JQuery;
  mouseup(handler?: Function): JQuery;
  mousemove(handler?: Function): JQuery;
  keydown(handler?: Function): JQuery;
  keyup(handler?: Function): JQuery;
  keypress(handler?: Function): JQuery;
  submit(handler?: Function): JQuery;
  change(handler?: Function): JQuery;
  focus(handler?: Function): JQuery;
  blur(handler?: Function): JQuery;
  resize(handler?: Function): JQuery;
  scroll(handler?: Function): JQuery;

  // Effects
  show(duration?: number | string, complete?: Function): JQuery;
  hide(duration?: number | string, complete?: Function): JQuery;
  toggle(duration?: number | string, complete?: Function): JQuery;
  fadeIn(duration?: number | string, complete?: Function): JQuery;
  fadeOut(duration?: number | string, complete?: Function): JQuery;
  fadeToggle(duration?: number | string, complete?: Function): JQuery;
  slideDown(duration?: number | string, complete?: Function): JQuery;
  slideUp(duration?: number | string, complete?: Function): JQuery;
  slideToggle(duration?: number | string, complete?: Function): JQuery;
  animate(properties: Record<string, any>, duration?: number | string, complete?: Function): JQuery;
  stop(clearQueue?: boolean, jumpToEnd?: boolean): JQuery;

  // Forms
  serialize(): string;
  serializeArray(): Array<{ name: string; value: string }>;

  // Utilities
  each(callback: (index: number, element: Element) => void | boolean): JQuery;
  map(callback: (index: number, element: Element) => any): JQuery;
  data(key: string): any;
  data(key: string, value: any): JQuery;
  data(): Record<string, any>;
  removeData(key?: string): JQuery;
  length: number;
  toArray(): Element[];
}

declare namespace JQuery {
  interface Promise<T> {
    done(callback: (value: T) => void): Promise<T>;
    fail(callback: (error: any) => void): Promise<T>;
    always(callback: () => void): Promise<T>;
    then<U>(
      doneCallback: (value: T) => U | Promise<U>,
      failCallback?: (error: any) => U | Promise<U>
    ): Promise<U>;
    catch<U>(
      failCallback: (error: any) => U | Promise<U>
    ): Promise<U>;
    [Symbol.toStringTag]: string;
  }
}

declare const $: JQueryStatic;
declare const jQuery: JQueryStatic;

// Global declarations for browser environment
declare global {
  interface Window {
    $: JQueryStatic;
    jQuery: JQueryStatic;
    hljs: any;
    mermaid: any;
    StateModule: any;
    ApiClient: any;
    WebSocketModule: any;
    WebSocketModuleV2: any;
    MessageRenderer: any;
    ToolRenderer: any;
    Validators: any;
    Formatters: any;
  }

  const global: Window;
}