// Narrow public API contracts used by this application. Upstream packages ship
// full typings; these declarations also support stripped offline distributions.
declare module '@xterm/xterm' {
  export interface IDisposable {
    dispose(): void;
  }
  export interface ITerminalAddon {
    activate(terminal: Terminal): void;
    dispose(): void;
  }
  export interface ITerminalOptions {
    cols?: number;
    rows?: number;
    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    scrollback?: number;
    cursorBlink?: boolean;
    allowProposedApi?: boolean;
    theme?: {
      background?: string;
      foreground?: string;
      cursor?: string;
      selectionBackground?: string;
    };
    disableStdin?: boolean;
  }
  export class Terminal {
    readonly buffer: {
      active: {
        getLine(row: number):
          | {
              translateToString(trimRight?: boolean): string;
              getCell(col: number): { getFgColor(): number } | undefined;
            }
          | undefined;
        length: number;
        cursorX: number;
        cursorY: number;
      };
    };
    constructor(options?: ITerminalOptions);
    options: ITerminalOptions;
    readonly cols: number;
    readonly rows: number;
    readonly element: HTMLElement | undefined;
    readonly parser: {
      registerOscHandler(
        id: number,
        handler: (data: string) => boolean,
      ): IDisposable;
    };
    open(parent: HTMLElement): void;
    dispose(): void;
    focus(): void;
    resize(cols: number, rows: number): void;
    write(data: string | Uint8Array, callback?: () => void): void;
    reset(): void;
    onData(handler: (data: string) => void): IDisposable;
    onBinary(handler: (data: string) => void): IDisposable;
    onTitleChange(handler: (title: string) => void): IDisposable;
    attachCustomKeyEventHandler(
      handler: (event: KeyboardEvent) => boolean,
    ): void;
    hasSelection(): boolean;
    getSelection(): string;
    clearSelection(): void;
    paste(data: string): void;
    loadAddon(addon: ITerminalAddon): void;
    refresh(start: number, end: number): void;
  }
}
declare module '@xterm/addon-webgl' {
  import type { ITerminalAddon, IDisposable, Terminal } from '@xterm/xterm';
  export class WebglAddon implements ITerminalAddon {
    activate(terminal: Terminal): void;
    dispose(): void;
    onContextLoss(handler: () => void): IDisposable;
  }
}
