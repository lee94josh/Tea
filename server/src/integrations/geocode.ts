/**
 * Venue resolution — Google Places. We use Nearby Search (New) ranked by
 * distance with a small radius, and fall back to Reverse Geocoding for a
 * coarse address when no place is found. Swap to Foursquare later if restaurant
 * granularity disappoints (the interface stays the same).
 */

import { env } from '../env';

export interface VenueCandidate {
  name: string | null;
  category: string | null;
  address: string | null;
  placeId: string | null;
  confidence: number | null;
  source: string;
}

export interface GeocodeClient {
  nearbyVenues(lat: number, lng: number): Promise<VenueCandidate[]>;
}

export class GooglePlaces implements GeocodeClient {
  async nearbyVenues(lat: number, lng: number): Promise<VenueCandidate[]> {
    const candidates = await this.nearby(lat, lng);
    if (candidates.length > 0) return candidates;
    const reverse = await this.reverse(lat, lng);
    return reverse ? [reverse] : [];
  }

  private async nearby(lat: number, lng: number): Promise<VenueCandidate[]> {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.googlePlaces.apiKey,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.primaryType,places.types,places.id',
      },
      body: JSON.stringify({
        maxResultCount: 5,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 50 },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Places searchNearby ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        primaryType?: string;
        types?: string[];
      }>;
    };
    const places = data.places ?? [];
    return places.map((p, i) => ({
      name: p.displayName?.text ?? null,
      category: p.primaryType ?? p.types?.[0] ?? null,
      address: p.formattedAddress ?? null,
      placeId: p.id ?? null,
      // Distance-ranked: first is closest. Decay confidence by rank.
      confidence: Math.max(0.3, 1 - i * 0.15),
      source: 'google_places',
    }));
  }

  private async reverse(lat: number, lng: number): Promise<VenueCandidate | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', env.googlePlaces.apiKey);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ formatted_address?: string; place_id?: string }>;
    };
    const first = data.results?.[0];
    if (!first) return null;
    return {
      name: null,
      category: null,
      address: first.formatted_address ?? null,
      placeId: first.place_id ?? null,
      confidence: 0.2,
      source: 'google_geocode',
    };
  }
}

/**
 * Keyless fallback: OpenStreetMap Nominatim reverse geocoding. No API key, free
 * for light use (single-user is well within policy; identify with a UA). Less
 * venue-precise than Places but gives a real name/address instead of nothing —
 * and never hallucinated, which the spec cares about more.
 */
export class NominatimGeocode implements GeocodeClient {
  async nearbyVenues(lat: number, lng: number): Promise<VenueCandidate[]> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '18'); // building/venue level

    const res = await fetch(url, {
      headers: { 'User-Agent': 'lookback/0.1 (personal photo app; single user)' },
    });
    if (!res.ok) throw new Error(`Nominatim reverse ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      name?: string;
      display_name?: string;
      category?: string;
      type?: string;
      osm_type?: string;
      osm_id?: number;
    };
    if (!data.display_name && !data.name) return [];
    return [
      {
        name: data.name || null,
        category: data.type ?? data.category ?? null,
        address: data.display_name ?? null,
        placeId: data.osm_id != null ? `${data.osm_type ?? 'osm'}/${data.osm_id}` : null,
        confidence: data.name ? 0.5 : 0.25,
        source: 'nominatim',
      },
    ];
  }
}

/**
 * Keyless POI candidates via OpenStreetMap Overpass: named food/drink/leisure
 * places within ~120m. This is what makes "which restaurant is this sandwich
 * from?" answerable without a Places key — the candidates get handed to the
 * vision model, which picks by matching what's actually in the photo.
 */
export class OverpassGeocode implements GeocodeClient {
  private fallback = new NominatimGeocode();

  async nearbyVenues(lat: number, lng: number): Promise<VenueCandidate[]> {
    let pois: VenueCandidate[] = [];
    try {
      pois = await this.pois(lat, lng);
    } catch (err) {
      console.warn('[geocode] overpass failed, falling back to reverse:', err);
    }
    // Always include the reverse-geocode hit too (address context + sometimes
    // the building POI itself).
    let reverse: VenueCandidate[] = [];
    try {
      reverse = await this.fallback.nearbyVenues(lat, lng);
    } catch {
      /* fine */
    }
    return [...pois, ...reverse].slice(0, 8);
  }

  private async pois(lat: number, lng: number): Promise<VenueCandidate[]> {
    const around = `around:120,${lat},${lng}`;
    const q = `
      [out:json][timeout:10];
      (
        nwr[name][amenity~"^(restaurant|cafe|bar|fast_food|pub|ice_cream|bakery|food_court|biergarten)$"](${around});
        nwr[name][shop~"^(bakery|deli|coffee|convenience)$"](${around});
        nwr[name][tourism~"^(attraction|museum|gallery)$"](${around});
      );
      out center 12;
    `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'lookback/0.1 (personal photo app; single user)',
      },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = (await res.json()) as {
      elements?: Array<{
        id: number;
        type: string;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };
    const els = data.elements ?? [];
    return els
      .filter((e) => e.tags?.name)
      .map((e) => {
        const plat = e.lat ?? e.center?.lat;
        const plng = e.lon ?? e.center?.lon;
        const dist =
          plat != null && plng != null ? haversineMeters(lat, lng, plat, plng) : 120;
        return {
          name: e.tags!.name ?? null,
          category:
            e.tags!.amenity ?? e.tags!.shop ?? e.tags!.tourism ?? e.tags!.cuisine ?? null,
          address: [e.tags!['addr:housenumber'], e.tags!['addr:street']]
            .filter(Boolean)
            .join(' ') || null,
          placeId: `${e.type}/${e.id}`,
          // Closer = more confident; 0m → 0.9, 120m → ~0.3.
          confidence: Math.max(0.3, 0.9 - dist / 200),
          source: 'overpass',
        };
      })
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  }
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let _geo: GeocodeClient | null = null;
export function geocode(): GeocodeClient {
  if (!_geo) {
    _geo = env.googlePlaces.apiKey ? new GooglePlaces() : new OverpassGeocode();
  }
  return _geo;
}
