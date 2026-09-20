declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(value: string): { digest(encoding: 'hex'): string };
  };
  export function randomUUID(): string;
}

declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function unlink(path: string): Promise<void>;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:http' {
  export interface IncomingMessage extends AsyncIterable<Uint8Array | string> {
    readonly url?: string;
    readonly method?: string;
    readonly headers: Record<string, string | string[] | undefined>;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(data?: string): void;
  }
}

declare class Buffer extends Uint8Array {
  static isBuffer(value: unknown): value is Buffer;
  static from(value: string | Uint8Array): Buffer;
  static concat(values: readonly Uint8Array[]): Buffer;
  readonly byteLength: number;
  toString(encoding?: 'utf8'): string;
}
