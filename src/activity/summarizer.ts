export type Activity = 'idle' | 'running' | 'waiting';
export type ActivitySummary = {
  activity: Activity;
  text: string;
  detail: string;
};
export type ProcessSignal = {
  status: 'starting' | 'running' | 'exited' | 'error';
  exitCode?: number;
  now: number;
};

/** Local implementations consume output, never commands, input text or layout history. */
export interface ActivitySummarizer {
  output(bytes: Uint8Array, now: number): void;
  input(now: number): void;
  reset(): void;
  summarize(signal: ProcessSignal): ActivitySummary;
}

/** Streaming, bounded text extraction. Control strings are discarded, including split OSC/DCS. */
export class HeuristicActivitySummarizer implements ActivitySummarizer {
  private decoder = new TextDecoder();
  private mode: 'text' | 'escape' | 'csi' | 'string' | 'stringEscape' = 'text';
  private line = '';
  private previous = '';
  private lastOutput: number | undefined;
  private lastInput: number | undefined;
  reset() {
    this.decoder = new TextDecoder();
    this.mode = 'text';
    this.line = '';
    this.previous = '';
    this.lastOutput = undefined;
    this.lastInput = undefined;
  }
  input(now: number) {
    this.lastInput = now;
    this.line = '';
    this.previous = '';
  }
  output(bytes: Uint8Array, now: number) {
    if (!bytes.length) return;
    this.lastOutput = now;
    for (const c of this.decoder.decode(bytes, { stream: true })) {
      const code = c.codePointAt(0)!;
      if (this.mode === 'stringEscape') {
        this.mode =
          c === '\\' ? 'text' : c === '\x1b' ? 'stringEscape' : 'string';
        continue;
      }
      if (this.mode === 'string') {
        if (c === '\x07' || c === '\u009c') this.mode = 'text';
        else if (c === '\x1b') this.mode = 'stringEscape';
        continue;
      }
      if (c === '\x1b') {
        this.mode = 'escape';
        continue;
      }
      if (this.mode === 'escape') {
        this.mode =
          c === '['
            ? 'csi'
            : [']', 'P', '^', '_', 'X'].includes(c)
              ? 'string'
              : 'text';
        continue;
      }
      if (this.mode === 'csi') {
        if (code >= 0x40 && code <= 0x7e) this.mode = 'text';
        continue;
      }
      if (c === '\u009b') {
        this.mode = 'csi';
        continue;
      }
      if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) {
        this.mode = 'string';
        continue;
      }
      if (c === '\n' || c === '\r') {
        if (this.line.trim()) this.previous = this.line.trim();
        this.line = '';
        continue;
      }
      if (c === '\b') {
        this.line = this.line.slice(0, -1);
        continue;
      }
      if (c === '\t') {
        this.line = (this.line + ' ').slice(-320);
        continue;
      }
      if (
        code < 32 ||
        (code >= 127 && code <= 159) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      )
        continue;
      this.line = (this.line + c).slice(-320);
    }
  }
  summarize({ status, exitCode, now }: ProcessSignal): ActivitySummary {
    const detail = (this.line.trim() || this.previous).slice(-160);
    if (status === 'starting')
      return { activity: 'running', text: 'Starting terminal', detail: '' };
    if (status === 'exited')
      return {
        activity: 'idle',
        text: `Process exited${exitCode === undefined ? '' : ` (${exitCode})`}`,
        detail,
      };
    if (status === 'error')
      return { activity: 'idle', text: 'Terminal needs attention', detail };
    if (
      /(?:\[[yn]\/[yn]\]|\([yn]\/[yn]\)|\(yes\/no\)|password:\s*$|press (?:enter|any key)(?: to [\w ]+)?[.!:]?\s*$)/i.test(
        detail,
      )
    )
      return { activity: 'waiting', text: 'Possible input prompt', detail };
    const last = Math.max(
      this.lastOutput ?? -Infinity,
      this.lastInput ?? -Infinity,
    );
    if (!Number.isFinite(last))
      return { activity: 'idle', text: 'No output observed yet', detail: '' };
    const seconds = Math.max(0, Math.floor((now - last) / 1000));
    if (seconds >= 5)
      return {
        activity: 'idle',
        text: `Quiet for ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`}`,
        detail,
      };
    return {
      activity: 'running',
      text:
        this.lastInput !== undefined &&
        this.lastInput > (this.lastOutput ?? -Infinity)
          ? 'Input sent recently'
          : 'Output active',
      detail,
    };
  }
}
