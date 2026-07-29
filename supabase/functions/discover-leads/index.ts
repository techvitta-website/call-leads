// ═══════════════════════════════════════════════════════════════
// discover-leads — find real local businesses to sell to.
//
// SOURCES AND WHAT YOU MAY DO WITH THEM
//
//   osm     OpenStreetMap via Overpass. ODbL: commercial use and permanent
//           storage are permitted, attribution required. Safe to import.
//
//   places  Google Places API (New). Google's terms forbid storing the name,
//           address or phone — only the place_id may be kept. So this branch
//           returns results marked storable:false and the UI blocks import.
//           Requires a Google Cloud key with Places API (New) enabled, held
//           in Vault as `google_places_key`.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Category → OSM tag filters ─────────────────────────────────
const CATEGORIES: Record<string, { label: string; selectors: string[] }> = {
  school:       { label: "Schools",                    selectors: ['["amenity"="school"]'] },
  college:      { label: "Colleges & universities",    selectors: ['["amenity"="college"]', '["amenity"="university"]'] },
  coaching:     { label: "Coaching & training centres", selectors: ['["amenity"="prep_school"]', '["amenity"="training"]'] },
  kindergarten: { label: "Preschools & kindergartens", selectors: ['["amenity"="kindergarten"]'] },
  clinic:       { label: "Clinics & doctors",          selectors: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"="clinic"]', '["healthcare"="doctor"]'] },
  dermatology:  { label: "Skin & cosmetic clinics",    selectors: ['["healthcare:speciality"~"dermatology|cosmetic",i]'] },
  dentist:      { label: "Dental clinics",             selectors: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
  hospital:     { label: "Hospitals",                  selectors: ['["amenity"="hospital"]'] },
  pharmacy:     { label: "Pharmacies",                 selectors: ['["amenity"="pharmacy"]'] },
  veterinary:   { label: "Veterinary clinics",         selectors: ['["amenity"="veterinary"]'] },
  factory:      { label: "Factories & industrial",     selectors: ['["man_made"="works"]', '["building"="industrial"]["name"]'] },
  company:      { label: "Company offices",            selectors: ['["office"="company"]', '["office"="it"]', '["office"="engineering"]'] },
  hotel:        { label: "Hotels & resorts",           selectors: ['["tourism"="hotel"]', '["tourism"="resort"]'] },
  restaurant:   { label: "Restaurants & cafes",        selectors: ['["amenity"="restaurant"]', '["amenity"="cafe"]'] },
  gym:          { label: "Gyms & fitness",             selectors: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'] },
  salon:        { label: "Salons & spas",              selectors: ['["shop"="hairdresser"]', '["shop"="beauty"]', '["leisure"="spa"]'] },
  retail:       { label: "Shops & supermarkets",       selectors: ['["shop"="supermarket"]', '["shop"="department_store"]', '["shop"="wholesale"]'] },
  bank:         { label: "Banks & finance",            selectors: ['["amenity"="bank"]', '["office"="financial"]', '["office"="insurance"]'] },
  logistics:    { label: "Logistics & warehouses",     selectors: ['["building"="warehouse"]["name"]', '["office"="logistics"]'] },
  automotive:   { label: "Car dealers & workshops",    selectors: ['["shop"="car"]', '["shop"="car_repair"]'] },
};

/** Normalise Indian phone formats to +91XXXXXXXXXX where possible. */
function normalisePhone(raw: string): string {
  if (!raw) return "";
  // OSM often packs several numbers into one tag — take the first.
  const first = String(raw).split(/[;,]/)[0].trim();
  const d = first.replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `+91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length === 13 && d.startsWith("091")) return `+91${d.slice(3)}`;
  if (d.length >= 8) return `+91${d.replace(/^0+/, "")}`;
  return "";
}

function buildAddress(t: Record<string, string>): string {
  return [
    t["addr:housenumber"] && t["addr:street"]
      ? `${t["addr:housenumber"]} ${t["addr:street"]}`
      : t["addr:street"],
    t["addr:suburb"] || t["addr:neighbourhood"],
    t["addr:city"] || t["addr:town"] || t["addr:village"],
    t["addr:state"],
    t["addr:postcode"],
  ].filter(Boolean).join(", ");
}

// ─── Geocode a place name to a bounding box ─────────────────────
async function geocode(place: string): Promise<{ bbox: number[]; display: string } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", place);
  url.searchParams.set("format", "json");
  // Nominatim's FIRST hit is often a small sub-district rather than the city
  // — searching "Hyderabad" returned Bahadurpura mandal, whose bounding box
  // covers a fraction of the metro. Ask for several and pick deliberately.
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    // Nominatim blocks requests with no identifying User-Agent.
    headers: { "User-Agent": "TechvittaCRM/1.0 (sales.techvitta.in)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  // Nominatim returns boundingbox as [south, north, west, east] strings.
  const area = (h: any) => {
    const [s, n, w, e] = (h.boundingbox ?? []).map(Number);
    if ([s, n, w, e].some((v) => !Number.isFinite(v))) return 0;
    return Math.abs(n - s) * Math.abs(e - w);
  };

  // Prefer administrative areas over shops, buildings and bus stops that
  // happen to share the name.
  const ADMIN_TYPES = new Set([
    "city", "town", "village", "state", "district", "county",
    "municipality", "suburb", "administrative", "region", "province",
  ]);

  const admin = data.filter(
    (h: any) =>
      ADMIN_TYPES.has(String(h.addresstype ?? "")) ||
      ADMIN_TYPES.has(String(h.type ?? "")) ||
      h.class === "boundary",
  );

  // Among the sensible candidates take the largest — that's the whole city
  // rather than one of its mandals.
  const pool = admin.length ? admin : data;
  const best = pool.reduce((a: any, b: any) => (area(b) > area(a) ? b : a));

  const [s, n, w, e] = (best.boundingbox ?? []).map(Number);
  if ([s, n, w, e].some((v) => !Number.isFinite(v))) return null;

  return { bbox: [s, w, n, e], display: best.display_name };
}

async function discoverOSM(
  category: string,
  bbox: number[],
  limit: number,
  requirePhone: boolean,
) {
  const cat = CATEGORIES[category];
  if (!cat) throw new Error(`Unknown category "${category}".`);

  const [s, w, n, e] = bbox;
  const area = `(${s},${w},${n},${e})`;

  // Named results only — an unnamed node is useless as a lead.
  const clauses = cat.selectors.map((sel) => `nwr${sel}["name"]${area};`).join("");
  const query = `[out:json][timeout:60];(${clauses});out center ${Math.min(limit * 5, 500)};`;

  // The public Overpass instances rate-limit hard and reject requests with no
  // User-Agent (406). Identify ourselves, and fall through to a mirror when
  // the primary is busy — it frequently is.
  const MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  let data: any = null;
  let lastError = "";

  for (const endpoint of MIRRORS) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "TechvittaCRM/1.0 (sales.techvitta.in)",
          Accept: "application/json",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(70000),
      });
    } catch (e) {
      lastError = `${endpoint}: ${String((e as Error)?.message ?? e)}`;
      continue;
    }

    if (res.ok) {
      data = await res.json();
      break;
    }

    lastError = `${endpoint} returned ${res.status}`;
    // 429/504 mean "busy" — worth trying the next mirror. Anything else is
    // likely our query being wrong, so stop and report it.
    if (![429, 504, 406, 403].includes(res.status)) {
      const t = await res.text();
      throw new Error(`OpenStreetMap query failed (${res.status}): ${t.slice(0, 200)}`);
    }
  }

  if (!data) {
    throw new Error(
      `Every OpenStreetMap server was busy or unreachable. Try again in a minute, or search a smaller area. Last: ${lastError}`,
    );
  }
  const seen = new Set<string>();
  const out: any[] = [];

  for (const el of data?.elements ?? []) {
    const t = el.tags ?? {};
    const name = String(t.name ?? "").trim();
    if (!name) continue;

    const phone = normalisePhone(t.phone || t["contact:phone"] || t["phone:mobile"] || "");
    const email = String(t.email || t["contact:email"] || "").trim();
    if (requirePhone && !phone && !email) continue;

    // OSM often holds a chain's branches as separate nodes with identical
    // details. Key on name+phone so each distinct branch appears once.
    const key = `${name.toLowerCase()}|${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      source: "OpenStreetMap",
      source_id: `${el.type}/${el.id}`,
      company_name: name,
      phone,
      email,
      website: String(t.website || t["contact:website"] || "").trim(),
      address: buildAddress(t),
      city: t["addr:city"] || t["addr:town"] || t["addr:village"] || "",
      state: t["addr:state"] || "",
      category: cat.label,
      osm_kind: t.amenity || t.healthcare || t.office || t.shop || t.tourism || t.leisure || "",
      operator: String(t.operator || "").trim(),
      lat: el.lat ?? el.center?.lat ?? null,
      lon: el.lon ?? el.center?.lon ?? null,
      storable: true,
    });

    if (out.length >= limit) break;
  }
  return out;
}

// ─── Google Places discovery (view-only) ────────────────────────
async function discoverPlaces(query: string, bbox: number[] | null, limit: number) {
  const { data: key } = await admin.rpc("get_google_places_key");
  if (!key) {
    return {
      unavailable:
        "No Google Places key is configured. Create a Google Cloud API key with Places API (New) enabled, then store it by running: select public.set_google_places_key('YOUR_KEY');",
      results: [] as any[],
    };
  }

  const body: Record<string, any> = {
    textQuery: query,
    languageCode: "en",
    regionCode: "IN",
    pageSize: Math.min(limit, 20),
  };
  if (bbox) {
    const [s, w, n, e] = bbox;
    body.locationRestriction = {
      rectangle: { low: { latitude: s, longitude: w }, high: { latitude: n, longitude: e } },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key as string,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.primaryType",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Places error ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = await res.json();
  const results = (data?.places ?? []).slice(0, limit).map((p: any) => ({
    source: "Google Places",
    source_id: p.id,
    company_name: p.displayName?.text ?? "",
    phone: normalisePhone(p.nationalPhoneNumber ?? ""),
    email: "",
    website: p.websiteUri ?? "",
    address: p.formattedAddress ?? "",
    city: "",
    state: "",
    category: p.primaryType ?? "",
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? null,
    business_status: p.businessStatus ?? "",
    // Google's terms permit storing the place id and nothing else.
    storable: false,
  }));

  return { unavailable: null, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Only signed-in CRM users.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in to use lead discovery." }, 401);

  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return json({ error: "Your session has expired. Sign in again." }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be valid JSON." }, 400);
  }

  // Category list for the UI to render.
  if (body?.action === "categories") {
    return json({
      categories: Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.label })),
    });
  }

  const source = String(body?.source ?? "osm");
  const place = String(body?.place ?? "").trim();
  const category = String(body?.category ?? "school");
  const limit = Math.min(Math.max(Number(body?.limit) || 40, 1), 120);
  const requirePhone = body?.requirePhone !== false;
  const projectId = body?.projectId ?? null;

  if (!place) return json({ error: "Enter a city or area to search." }, 400);

  try {
    const geo = await geocode(place);
    if (!geo) {
      return json(
        { error: `Could not find "${place}" on the map. Try a city name like "Hyderabad".` },
        404,
      );
    }

    let results: any[] = [];
    let unavailable: string | null = null;

    if (source === "places") {
      const label = CATEGORIES[category]?.label ?? category;
      const r = await discoverPlaces(`${label} in ${place}`, geo.bbox, limit);
      results = r.results;
      unavailable = r.unavailable;
    } else {
      results = await discoverOSM(category, geo.bbox, limit, requirePhone);
    }

    // Flag anything already in the CRM so nobody imports it twice.
    if (results.length && projectId) {
      const { data: existing } = await admin
        .from("leads")
        .select("company_name, phone")
        .eq("project_id", projectId)
        .limit(5000);

      const havePhone = new Set((existing ?? []).map((l: any) => l.phone).filter(Boolean));
      const haveName = new Set(
        (existing ?? []).map((l: any) => String(l.company_name ?? "").trim().toLowerCase()),
      );

      for (const r of results) {
        r.already_in_crm =
          Boolean(r.phone && havePhone.has(r.phone)) ||
          haveName.has(r.company_name.trim().toLowerCase());
      }
    }

    return json({
      ok: true,
      source,
      place: geo.display,
      category: CATEGORIES[category]?.label ?? category,
      count: results.length,
      with_phone: results.filter((r) => r.phone).length,
      already_in_crm: results.filter((r) => r.already_in_crm).length,
      unavailable,
      attribution:
        source === "places" ? "Powered by Google" : "© OpenStreetMap contributors (ODbL)",
      results,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
