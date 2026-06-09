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

let _geo: GeocodeClient | null = null;
export function geocode(): GeocodeClient {
  if (!_geo) {
    _geo = env.googlePlaces.apiKey ? new GooglePlaces() : new NominatimGeocode();
  }
  return _geo;
}
