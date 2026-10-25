/** De beveiligingsheaders die bij elk antwoord horen, inclusief de Content-Security-Policy. */
export class SecurityHeaders {
  constructor(supabaseUrl) {
    this.supabaseUrl = supabaseUrl;
  }

  /** De policy staat alleen Supabase, de GIF-diensten en Google Fonts toe. */
  contentSecurityPolicy() {
    let http = '';
    let ws = '';
    try {
      const origin = new URL(this.supabaseUrl);
      http = origin.origin;
      ws = `${origin.protocol === 'https:' ? 'wss' : 'ws'}://${origin.host}`;
    } catch { /* geen geldige Supabase-URL ingesteld */ }
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${http} https://*.giphy.com https://*.klipy.com`.trim(),
      `connect-src 'self' ${http} ${ws}`.trim(),
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  toObject() {
    return {
      'Content-Security-Policy': this.contentSecurityPolicy(),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
    };
  }
}
