import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { unavailable } from '../../../../lib/hotel/api';
import { amenityCsv } from '../../../../lib/hotel/amenities-core';
import { listAmenities, listAmenityMatrix } from '../../../../lib/hotel/rooms';

export const prerender = false;

// Listing de tous les équipements, chambre par chambre (oui / non / sur demande / en supplément), en CSV pour Excel.
export const GET: APIRoute = async () => {
  try {
    const [rooms, amenities] = await Promise.all([listAmenityMatrix(), listAmenities()]);
    return new Response(amenityCsv(rooms, amenities), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="equipements-par-chambre.csv"', 'cache-control': 'no-store' },
    });
  } catch (e) { return unavailable('room-amenities-csv', e); }
};
