import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';

export interface GeoInfo {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  asn: string | null;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY: GeoInfo = {
  countryCode: null,
  country: null,
  region: null,
  city: null,
  isp: null,
  asn: null,
  latitude: null,
  longitude: null,
};

/** IP nội bộ/loopback: không có vị trí địa lý để tra. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
  }
  return true; // không phải IP hợp lệ
}

/**
 * Tra vị trí từ IP bằng ipwho.is (HTTPS, miễn phí, không cần key). IP được gửi sang dịch vụ bên thứ ba,
 * chỉ gồm IP chứ không kèm username hay website. Kết quả được cache trong bộ nhớ để không tra lặp.
 */
@Injectable()
export class GeoIpService {
  private readonly logger = new Logger(GeoIpService.name);
  private cache = new Map<string, { at: number; geo: GeoInfo }>();
  private static readonly TTL_MS = 24 * 3_600_000;

  /** Trả null nếu tra thất bại (mạng/giới hạn lượt) để nơi gọi thử lại sau; IP nội bộ trả EMPTY. */
  async lookup(ip: string): Promise<GeoInfo | null> {
    if (isPrivateIp(ip)) return EMPTY;

    const hit = this.cache.get(ip);
    if (hit && Date.now() - hit.at < GeoIpService.TTL_MS) return hit.geo;

    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(3000),
      });
      const d = (await res.json()) as {
        success?: boolean;
        message?: string;
        country?: string;
        country_code?: string;
        region?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        connection?: { asn?: number; isp?: string; org?: string };
      };
      if (!res.ok || !d.success) {
        this.logger.warn(`GeoIP ${ip}: ${d.message ?? res.status}`);
        return null;
      }
      const geo: GeoInfo = {
        countryCode: d.country_code ?? null,
        country: d.country ?? null,
        region: d.region ?? null,
        city: d.city ?? null,
        isp: d.connection?.isp ?? d.connection?.org ?? null,
        asn: d.connection?.asn ? `AS${d.connection.asn}` : null,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
      };
      this.cache.set(ip, { at: Date.now(), geo });
      return geo;
    } catch (e) {
      this.logger.warn(`GeoIP ${ip} thất bại: ${(e as Error).message}`);
      return null;
    }
  }
}
