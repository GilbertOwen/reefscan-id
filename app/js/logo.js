// ReefScan-ID logo. Concept C (porthole with sonar, no bolts) is the one in use; A and B stay on #/logo as alternatives.
//
// A: the hull of a submarine drawn as an eye. From afar it reads as an eye, up close as a submarine with its tower,
//    periscope and stern fins. The porthole is the iris (it scans), the arcs in front are sonar, and the small coral is
//    what it looks for. Meaning: diving into the sea (submarine) + looking closely (eye) + scanning (sonar) the reef.
// B: a periscope rising through the sea surface whose lens is an eye, with coral below the waves.
// C: a submarine porthole; inside, a reef and the sweep of a scanner (see markC).

let uid = 0;

export function markA({ size = 32, tile = true, dark = false } = {}) {
  const id = "lgA" + uid++;
  const hull = "#E9FBFF";
  const ink = "#062236";
  const aqua = "#38D3F0";
  const bg = tile
    ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B78A0"/><stop offset="1" stop-color="#062236"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#${id})"/>`
    : "";
  const body = tile || dark ? hull : ink;
  const iris = tile || dark ? ink : "#0A6A8C";
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Logo ReefScan-ID: kapal selam berbentuk mata">${bg}
    <path d="M30 18.5V11.5h5" fill="none" stroke="${body}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21.5 28.6 22.8 21a2.6 2.6 0 0 1 2.6-2.2h5.4a2.6 2.6 0 0 1 2.6 2.2l1.3 7.6z" fill="${body}"/>
    <path d="M13.2 31 9 25.6l6.6 2.6zM13.2 41 9 46.4l6.6-2.6z" fill="${body}"/>
    <path d="M8 36c8-12 30-12 38 0-8 12-30 12-38 0z" fill="${body}"/>
    <circle cx="27" cy="36" r="7.2" fill="${iris}"/>
    <circle cx="27" cy="36" r="7.2" fill="none" stroke="${aqua}" stroke-width="2"/>
    <circle cx="27" cy="36" r="3" fill="${aqua}"/>
    <circle cx="29.2" cy="33.8" r="1.3" fill="#FFFFFF"/>
    <path d="M49.9 31.4a6 6 0 0 1 0 9.2" fill="none" stroke="${aqua}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M53.1 27.6a11 11 0 0 1 0 16.8" fill="none" stroke="${aqua}" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    <path d="M53 57v-6.5m0 3-3.2-3.2m3.2 1.7 3.2-3.2" fill="none" stroke="${aqua}" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
  </svg>`;
}

export function markB({ size = 32 } = {}) {
  const id = "lgB" + uid++;
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Konsep B: periskop bermata">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E5C86"/><stop offset="1" stop-color="#041826"/></linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="url(#${id})"/>
    <path d="M26 40V20a3 3 0 0 1 3-3h10" fill="none" stroke="#E9FBFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M36 11.5c4.5-4.2 11.5-4.2 16 0-4.5 4.2-11.5 4.2-16 0z" transform="translate(0 6)" fill="#E9FBFF"/>
    <circle cx="44" cy="17.5" r="3.2" fill="#062236"/><circle cx="44" cy="17.5" r="1.4" fill="#38D3F0"/>
    <path d="M6 38c4.6 0 4.6-3 9.3-3s4.6 3 9.3 3 4.6-3 9.3-3 4.6 3 9.3 3 4.6-3 9.3-3 4.6 3 9.3 3" fill="none" stroke="#38D3F0" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M20 58V48m0 4.5-4.5-4.5m4.5 2 4.5-4.5M40 58v-8m0 3.5-3.5-3.5m3.5 1.5 3.5-3.5" fill="none" stroke="#9CCFE0" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

// C (in use, chosen by the team designer, simplified on request): a submarine porthole without bolts, scanning with
// a sonar sweep. No coral, on request: the mark only says diving (porthole) and scanning (sweep).
export function markC({ size = 32 } = {}) {
  // A porthole scanning: frame, glass, one sonar ring and the sweep, with the ocean gradients of the visual guide
  const id = "lgC" + uid++;
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Logo ReefScan-ID: jendela kapal selam dengan sapuan sonar">
    <defs>
      <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7FECFB"/><stop offset=".55" stop-color="#2BB8DA"/><stop offset="1" stop-color="#0A6A8C"/></linearGradient>
      <radialGradient id="${id}g" cx=".42" cy=".3" r=".85"><stop offset="0" stop-color="#0F6A95"/><stop offset=".6" stop-color="#083350"/><stop offset="1" stop-color="#041826"/></radialGradient>
      <linearGradient id="${id}s" x1="32" y1="32" x2="50" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#38D3F0" stop-opacity=".9"/><stop offset="1" stop-color="#38D3F0" stop-opacity=".12"/></linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#${id}r)"/>
    <circle cx="32" cy="32" r="22" fill="url(#${id}g)"/>
    <circle cx="32" cy="32" r="12" fill="none" stroke="#38D3F0" stroke-opacity=".35" stroke-width="1.6"/>
    <path d="M32 32H54A22 22 0 0 1 43 51.05z" fill="url(#${id}s)"/>
    <circle cx="32" cy="32" r="3" fill="#7FECFB"/>
  </svg>`;
}

export function wordmark(dark = false) {
  return `<span class="wordmark${dark ? " wordmark-dark" : ""}">ReefScan<span class="wm-id">ID</span></span>`;
}
