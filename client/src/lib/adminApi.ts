// Admin API utilities with JWT authentication

export function getAdminToken(): string | null {
  return localStorage.getItem('adminToken');
}

export function getTokenExpiration(): number | null {
  const exp = localStorage.getItem('adminTokenExpiration');
  return exp ? parseInt(exp, 10) : null;
}

export function isTokenExpired(): boolean {
  const expiration = getTokenExpiration();
  if (!expiration) return true;
  return Date.now() > expiration;
}

export function isAdminAuthenticated(): boolean {
  console.log('🔍 [isAdminAuthenticated] Checking admin authentication status');
  
  const token = getAdminToken();
  console.log('[isAdminAuthenticated] Token present:', token ? 'YES' : 'NO');
  
  if (!token) {
    console.log('❌ [isAdminAuthenticated] No token found - NOT AUTHENTICATED');
    return false;
  }
  
  // Check if token is expired
  const expired = isTokenExpired();
  console.log('[isAdminAuthenticated] Token expired:', expired ? 'YES' : 'NO');
  
  if (expired) {
    console.log('❌ [isAdminAuthenticated] Token expired - clearing auth');
    clearAdminAuth();
    return false;
  }
  
  console.log('✅ [isAdminAuthenticated] Authentication valid');
  return true;
}

export function setAdminAuth(token: string, expiresIn: string): void {
  console.log('🔐 [setAdminAuth] Setting admin authentication');
  console.log('[setAdminAuth] Token length:', token?.length || 0);
  console.log('[setAdminAuth] ExpiresIn:', expiresIn);
  
  localStorage.setItem('adminToken', token);
  
  // Calculate expiration timestamp
  const expirationMs = parseExpiresIn(expiresIn);
  const expirationTime = Date.now() + expirationMs;
  console.log('[setAdminAuth] Expiration time:', new Date(expirationTime).toLocaleString());
  
  localStorage.setItem('adminTokenExpiration', expirationTime.toString());
  console.log('✅ [setAdminAuth] Token and expiration saved to localStorage');
}

function parseExpiresIn(expiresIn: string): number {
  // Parse JWT expiresIn format (e.g., "7d", "30d", "24h")
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    case 's': return value * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

export function clearAdminAuth(): void {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminTokenExpiration');
  localStorage.removeItem('adminUser');
}

export async function adminApiRequest<T = any>(
  url: string,
  method: string = 'GET',
  body?: any
): Promise<T> {
  // Get token from localStorage for Authorization header (fallback when cookies blocked)
  const token = getAdminToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include', // Send cookies automatically (primary auth method)
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    // Session expired or invalid - redirect to login
    window.location.href = '/admin/login';
    throw new Error('Session expired - please login again');
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}
