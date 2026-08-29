declare module '@nexora/dev-db' {
  export function bootEmbedded(url?: string): Promise<boolean>;
  export function dbStatus(opts?: unknown): Promise<unknown>;
  export function parseDatabaseUrl(url: string): unknown;
  export function isPortOpen(port: number): Promise<boolean>;
}

declare module 'bcryptjs' {
  export function hash(password: string, salt: number | string): Promise<string>;
  export function compare(password: string, hash: string): Promise<boolean>;
  export function hashSync(password: string, salt: number | string): string;
  export function compareSync(password: string, hash: string): boolean;
  export function genSaltSync(rounds?: number): string;
  export function genSalt(rounds?: number): Promise<string>;
}

declare module 'ioredis' {
  export interface RedisOptions {
    maxRetriesPerRequest?: number | null;
  }
  export default class Redis {
    constructor(url: string, options?: RedisOptions);
    quit(): Promise<'OK'>;
    disconnect(): void;
  }
}