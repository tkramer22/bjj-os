import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getApiUrl } from "./capacitorAuth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function addCacheBusting(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Convert to full URL for native bundled mode
  const fullUrl = getApiUrl(url);
  const bustURL = addCacheBusting(fullUrl);
  
  // Get admin token from localStorage if available
  const adminToken = localStorage.getItem('adminToken');
  
  const res = await fetch(bustURL, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {}),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Convert to full URL for native bundled mode
    const baseUrl = queryKey.join("/") as string;
    const fullUrl = getApiUrl(baseUrl);
    const url = addCacheBusting(fullUrl);
    const res = await fetch(url, {
      credentials: "include",
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
