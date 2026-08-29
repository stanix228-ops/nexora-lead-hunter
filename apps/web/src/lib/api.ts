export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nexora_token');
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('nexora_token', token);
  else localStorage.removeItem('nexora_token');
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = 'ERROR';
    let message = `Ошибка ${res.status}`;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code, message);
  }
  return res.json() as Promise<T>;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body,
  });
  return handle<T>(res);
}

export const get = <T = unknown>(path: string, query?: Record<string, string | number | boolean | undefined>) => {
  const qs = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return api<T>(`${path}${suffix}`);
};

export const post = <T = unknown>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json });
export const put = <T = unknown>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json });
export const patch = <T = unknown>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });