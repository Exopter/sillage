import * as THREE from 'three';

/**
 * Flight Club membership card: a physical Three.js object with engraved carbon,
 * metal inlays, a faceted rank insignia, an elastic handhold and the welcome
 * sequence. The module owns its canvas only; pages provide copy and controls.
 */

/** @typedef {'pioneer' | 'explorer' | 'pathfinder' | 'trailblazer' | 'core_team'} RankKey */
/** @typedef {{ rim: [number, number], field: [number, number], label: [number, number], glow: string, haze: string }} Film */
/** @typedef {{ light: string, deep: string, seam: string, body: string, edge: string, print: string, glow: string, gemGlow: string, gemLight: string, gemDeep: string, alt?: string, fieldFilm: number, shine: number, fire: number, gloss: number, sparkle?: number }} Glass */
/** @typedef {{ label: string, finish: string, color: string, metal: string, device: string, field: string, shell: string, crystal?: boolean, ink?: string, inkTint?: string, rim?: string, status?: string, glass?: Glass, film?: Film }} Rank */
/**
 * @typedef {Object} MembershipCardOptions
 * @property {string} name Member name as engraved on both faces.
 * @property {number} memberNumber Sequential member number, shown on four digits.
 * @property {RankKey} tier Rank finish to present.
 * @property {string} since Short joining date for the reverse, for example "NOV 2026".
 * @property {{ wordmark: string, monogram: string, wing: string }} assets URLs of the Exopter wordmark, EX monogram and Exowing axonometric SVGs.
 * @property {string} [status] Line under the member name. Defaults to the founding or member status of the rank.
 * @property {string} [edition] Edition line on the reverse.
 * @property {string} [footnote] Small note on the reverse, for example a preview disclaimer.
 * @property {boolean} [personal] `false` leaves the member block off the front, for generic renders.
 * @property {string} [transmissionBacking] Studio backing seen through the crystal, independent of the surrounding page. Defaults to Exopter paper.
 * @property {boolean} [dragToTurn] `false` keeps hover, click and programmatic turns only.
 * @property {(flipped: boolean) => void} [onFace] Called when the presented face changes.
 */
/**
 * @typedef {Object} MembershipCard
 * @property {(delaySeconds?: number) => void} reveal Plays the welcome sequence after an optional delay.
 * @property {(key: RankKey) => void} setRank Presents another rank finish on the front face.
 * @property {() => void} turn Turns the card to its other face.
 * @property {() => boolean} isFlipped Whether the reverse is presented.
 * @property {(settings?: { tier?: RankKey, background?: string, type?: string, quality?: number }) => string | null} snapshot Data URL of the card at rest, or null before layout.
 * @property {() => void} dispose Releases the scene, its listeners and GPU resources.
 */

/** Seconds after the sequence starts at which the insignia lands. */
export const IMPACT = 1.5;
/** Seconds after the sequence starts at which the card has been fully presented. */
const TURN = 3.2;
export const PRESENTED = IMPACT + .55 + TURN;

// Crystal palettes: facet tints from `light` to `deep`, the seam between facets,
// the color the body and the edge absorb toward, print, and the stone in the shield.
// Core Team uses saturated violet cut crystal. Each facet scintillates
// in turn as the card moves (`sparkle`).
/** @type {Glass} */
const ORCHID = { light: '#8846f6', deep: '#3000a8', seam: '#d6c0ff', body: '#5f18e6', edge: '#7024f5', print: '#e8deff', glow: '#6a1ad8', gemGlow: '#b48cff', gemLight: '#f3ebff', gemDeep: '#5a1fe0', fieldFilm: .04, shine: .6, fire: .08, gloss: .2, sparkle: .42 };
// `metal` values stay mid-toned so reflections keep their shape instead of clipping to white.
/** @type {Record<RankKey, Rank>} */
export const RANKS = {
  // Pioneer is blue-green anodized titanium: the interference film is tuned
  // to travel between teal, aqua and deep blue.
  pioneer: { label: 'Pioneer', finish: 'Iridescent titanium', color: '#86e6ec', metal: '#5cc0cc', device: '#d3eff1', field: '#05303f', shell: '#52aebc', film: { rim: [325, 415], field: [335, 410], label: [325, 415], glow: '#07564f', haze: '#18b8a8' } },
  explorer: { label: 'Explorer', finish: 'Brushed copper', color: '#d6a48a', metal: '#b9754f', device: '#c98862', field: '#0b0c0e', shell: '#a6a9ad' },
  pathfinder: { label: 'Pathfinder', finish: 'Brushed silver', color: '#cbd1d8', metal: '#aab2bd', device: '#c3cad3', field: '#0b0c0e', shell: '#a6a9ad' },
  trailblazer: { label: 'Trailblazer', finish: 'Champagne gold', color: '#d4c396', metal: '#b99a57', device: '#cdb06c', field: '#0b0c0e', shell: '#a6a9ad' },
  // Core Team uses saturated violet cut crystal.
  core_team: { label: 'Core Team', finish: 'Electric amethyst', color: '#eadfff', metal: '#f1e9ff', device: '#ffffff', field: '#34107a', shell: '#ffffff', crystal: true, ink: '#f4eeff', inkTint: '#ffffff', rim: '#e6e2f5', status: 'EXOPTER TEAM', glass: ORCHID },
};

const TEX_W = 2048;
const TEX_H = 1292;
const CARD_W = 8.56;
const CARD_H = 5.4;
const INSIGNIA_AT = { x: 2.16, y: .24 };
const INSIGNIA_Z = .062;
const EXPOSURE = 1.1;
const DEFAULT_TILT = -.04;
const REST_YAW = -.12;
// Non-Pioneer finishes keep a negligible film instead of none: every rank then
// shares the same shader programs and a rank change never stalls on a compile.
const FILM_OFF = .001;

/** @typedef {[number, number, number]} Point */
/** @typedef {{ map: THREE.CanvasTexture, bump: THREE.CanvasTexture }} Foil */

/**
 * @param {number} [width]
 * @param {number} [height]
 * @param {number} [resolution]
 * @returns {[HTMLCanvasElement, CanvasRenderingContext2D]}
 */
function makeCanvas(width = TEX_W, height = TEX_H, resolution = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width * resolution;canvas.height = height * resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  ctx.scale(resolution, resolution);
  return [canvas, ctx];
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} content
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {{ color?: string, family?: string, tracking?: number, align?: 'left' | 'right', maxWidth?: number, weight?: number }} [style]
 */
function text(ctx, content, x, y, size, { color = '#ffffff', family = 'Aptos', tracking = 0, align = 'left', maxWidth = Infinity, weight = 400 } = {}) {
  ctx.letterSpacing = `${tracking}px`;
  ctx.font = `${weight} ${size}px "${family}"`;
  // Long names shrink to their column instead of running under the next block.
  const width = ctx.measureText(content).width;
  if (width > maxWidth) ctx.font = `${weight} ${Math.floor(size * maxWidth / width)}px "${family}"`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  // Canvas tracking trails the last glyph; pull right-aligned runs back onto the margin.
  ctx.fillText(content, align === 'right' ? x + tracking : x, y);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

/**
 * @param {number} w
 * @param {number} h
 * @param {number} radius
 */
function roundedShape(w, h, radius) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + w - radius, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + radius);
  shape.lineTo(x + w, y + h - radius);
  shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  shape.lineTo(x + radius, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function faceGeometry() {
  const geometry = new THREE.ShapeGeometry(roundedShape(CARD_W, CARD_H, .28), 24);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + CARD_W / 2) / CARD_W, (position.getY(i) + CARD_H / 2) / CARD_H);
  return geometry;
}

/** @param {number[][]} points */
function polygon(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

/** @param {THREE.BufferGeometry} geometry */
function mapToBounds(geometry) {
  geometry.computeBoundingBox();
  const { min, max } = /** @type {THREE.Box3} */ (geometry.boundingBox);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  // One continuous film across the shield. Default cap UVs use signed world
  // coordinates and repeat the film at the X/Y origin.
  for (let index = 0; index < position.count; index++) {
    uv.setXY(index, (position.getX(index) - min.x) / (max.x - min.x), (position.getY(index) - min.y) / (max.y - min.y));
  }
  return geometry;
}

/**
 * Flat-shaded facets: every polygon keeps its own normal, like a cut surface.
 * @param {Point[][]} facets
 * @param {string[]} tones One color per facet, so facets stay distinct in any light.
 */
function facetGeometry(facets, tones) {
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const uvs = [];
  /** @type {number[]} */
  const colors = [];
  const tone = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const [facetIndex, facet] of facets.entries()) {
    tone.set(tones[facetIndex]);
    for (let index = 1; index < facet.length - 1; index++) {
      const triangle = [facet[0], facet[index], facet[index + 1]];
      a.set(...triangle[1]).sub(b.set(...triangle[0]));
      b.set(...triangle[2]).sub(new THREE.Vector3(...triangle[0]));
      if (a.cross(b).z < 0) triangle.reverse();
      for (const point of triangle) { positions.push(...point);uvs.push(point[0] * .5 + .5, point[1] * .5 + .5);colors.push(tone.r, tone.g, tone.b); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The Exowing planform: leading edge, crest and trailing edge sampled from
// assets/blueprints/exowing-scene.glb at a few spanwise stations, seen from
// above with the nose up, plus one small roof per fin, as x, y, z
// triples in thousandths of an insignia unit. Regenerate with scripts/export-flightclub-wing-facets.py.
export const WING_FACETS = [0,148,11,91,154,6,91,121,117,0,148,11,91,121,117,0,96,116,0,96,116,91,121,117,91,-95,48,0,96,116,91,-95,48,0,-95,49,91,154,6,179,235,63,179,141,139,91,154,6,179,141,139,91,121,117,91,121,117,179,141,139,179,-248,86,91,121,117,179,-248,86,91,-95,48,179,235,63,333,203,68,333,105,141,179,235,63,333,105,141,179,141,139,179,141,139,333,105,141,333,-194,85,179,141,139,333,-194,85,179,-248,86,333,203,68,493,228,74,493,191,118,333,203,68,493,191,118,333,105,141,333,105,141,493,191,118,493,-101,78,333,105,141,493,-101,78,333,-194,85,493,228,74,653,273,44,653,215,100,493,228,74,653,215,100,493,191,118,493,191,118,653,215,100,653,-22,65,493,191,118,653,-22,65,493,-101,78,653,273,44,792,301,38,792,237,82,653,273,44,792,237,82,653,215,100,653,215,100,792,237,82,792,48,59,653,215,100,792,48,59,653,-22,65,388,0,113,388,-301,113,400,-301,169,388,0,113,400,-301,169,400,0,169,412,0,113,412,-301,113,400,-301,169,412,0,113,400,-301,169,400,0,169,0,148,11,-91,154,6,-91,121,117,0,148,11,-91,121,117,0,96,116,0,96,116,-91,121,117,-91,-95,48,0,96,116,-91,-95,48,0,-95,49,-91,154,6,-179,235,63,-179,141,139,-91,154,6,-179,141,139,-91,121,117,-91,121,117,-179,141,139,-179,-248,86,-91,121,117,-179,-248,86,-91,-95,48,-179,235,63,-333,203,68,-333,105,141,-179,235,63,-333,105,141,-179,141,139,-179,141,139,-333,105,141,-333,-194,85,-179,141,139,-333,-194,85,-179,-248,86,-333,203,68,-493,228,74,-493,191,118,-333,203,68,-493,191,118,-333,105,141,-333,105,141,-493,191,118,-493,-101,78,-333,105,141,-493,-101,78,-333,-194,85,-493,228,74,-653,273,44,-653,215,100,-493,228,74,-653,215,100,-493,191,118,-493,191,118,-653,215,100,-653,-22,65,-493,191,118,-653,-22,65,-493,-101,78,-653,273,44,-792,301,38,-792,237,82,-653,273,44,-792,237,82,-653,215,100,-653,215,100,-792,237,82,-792,48,59,-653,215,100,-792,48,59,-653,-22,65,-388,0,113,-388,-301,113,-400,-301,169,-388,0,113,-400,-301,169,-400,0,169,-412,0,113,-412,-301,113,-400,-301,169,-412,0,113,-400,-301,169,-400,0,169];

/**
 * The real wing in plan view.
 * @param {number} y
 * @param {number} size
 * @returns {Point[][]}
 */
function wingFacets(y, size) {
  /** @type {Point[][]} */
  const facets = [];
  for (let index = 0; index < WING_FACETS.length; index += 9) {
    /** @type {(offset: number) => Point} */
    const corner = (offset) => [WING_FACETS[index + offset] * size / 1000, y + WING_FACETS[index + offset + 1] * size / 1000, WING_FACETS[index + offset + 2] * size / 1000];
    facets.push([corner(0), corner(3), corner(6)]);
  }
  return facets;
}

/**
 * One tone per facet, by the way it faces a light from the upper left, with
 * neighbours kept slightly apart so every facet stays distinct.
 * @param {Point[][]} facets
 * @param {string} light
 * @param {string} deep
 */
function facetTones(facets, light, deep) {
  const [from, to, tone] = [new THREE.Color(light), new THREE.Color(deep), new THREE.Color()];
  const [normal, edge, sun] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(-.5, .62, .6).normalize()];
  return facets.map((facet, index) => {
    normal.set(...facet[1]).sub(edge.set(...facet[0])).cross(edge.set(...facet[2]).sub(new THREE.Vector3(...facet[0]))).normalize();
    const facing = Math.abs(normal.dot(sun));
    return `#${tone.copy(from).lerp(to, THREE.MathUtils.clamp((1 - facing) * 2 + (index % 2 ? .08 : -.08), 0, 1)).getHexString()}`;
  });
}

/** @param {THREE.Object3D} root */
function disposeTree(root) {
  root.traverse((object) => {
    const mesh = /** @type {Partial<THREE.Mesh>} */ (object);
    mesh.geometry?.dispose();
    for (const material of [mesh.material ?? []].flat()) material.dispose();
  });
}

/**
 * Sets the interference film thickness on either Three.js material API.
 * @param {THREE.MeshPhysicalMaterial} material
 * @param {number} minimum
 * @param {number} maximum
 */
function filmThickness(material, minimum, maximum) {
  const target = /** @type {any} */ (material);
  if (Number(THREE.REVISION) >= 187) { target.iridescenceThicknessMinimum = minimum;target.iridescenceThicknessMaximum = maximum; }
  else target.iridescenceThicknessRange = [minimum, maximum];
}

/**
 * @param {string} path
 * @param {(source: string) => string} [rewrite]
 */
async function loadVector(path, rewrite = (source) => source) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load illustration: ${path}`);
  const url = URL.createObjectURL(new Blob([rewrite(await response.text())], { type: 'image/svg+xml' }));
  try {
    const image = new Image();image.src = url;await image.decode();return image;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * A single-color copy of a logo, whatever ink its source uses.
 * @param {HTMLImageElement} image
 * @param {number} width
 * @param {number} height
 */
function whiteInk(image, width, height) {
  const [canvas, ctx] = makeCanvas(width, height);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';ctx.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * Paint one integer facet ID without interpolated edge values.
 * @param {Uint32Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {[number, number][]} corners
 * @param {number} level
 */
export function paintFacetIdentity(pixels, width, height, corners, level) {
  const packed = (0xff000000 | level << 16 | level << 8 | level) >>> 0;
  const firstY = Math.max(0, Math.ceil(Math.min(...corners.map((point) => point[1])) - .5));
  const lastY = Math.min(height, Math.ceil(Math.max(...corners.map((point) => point[1])) - .5));
  for (let y = firstY; y < lastY; y++) {
    const intersections = [];
    for (let edge = 0; edge < 3; edge++) {
      const [a, b] = [corners[edge], corners[(edge + 1) % 3]];
      if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) intersections.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    if (intersections.length === 2) {
      const left = Math.max(0, Math.ceil(Math.min(...intersections) - .5));
      const right = Math.min(width, Math.ceil(Math.max(...intersections) - .5));
      if (right > left) pixels.fill(packed, y * width + left, y * width + right);
    }
  }
}

/**
 * @param {HTMLElement} host Positioned element that receives the canvas and pointer gestures.
 * @param {MembershipCardOptions} options
 * @returns {Promise<MembershipCard>}
 */
export async function createMembershipCard(host, options) {
  const { name, memberNumber, since, assets, footnote = '', personal = true, dragToTurn = true, onFace } = options;
  // Large Retina presentations need more texels; compact profile cards stay light.
  const textureResolution = host.getBoundingClientRect().width * Math.min(devicePixelRatio, 2) > TEX_W ? 2 : 1;
  const memberName = name.toUpperCase();
  const number = String(memberNumber).padStart(4, '0');
  /** @type {RankKey} */
  let activeRank = options.tier;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const lifetime = new AbortController();
  const { signal } = lifetime;

  await Promise.all([document.fonts.load('400 32px Aptos'), document.fonts.load('400 32px "Aptos Display"'), document.fonts.load('400 32px "Aptos Mono"'), document.fonts.load('700 32px "Aptos Mono"')]);
  /** @type {(color: string) => (source: string) => string} */
  const wingInk = (color) => (source) => source.replaceAll('#10181a', 'none').replaceAll('#2fd6c6', color).replaceAll('stroke-width="1.6"', 'stroke-width="2.5"');
  const [wordmark, monogram, wing, wingShadow] = await Promise.all([
    loadVector(assets.wordmark).then((image) => whiteInk(image, 840, 84)),
    loadVector(assets.monogram).then((image) => whiteInk(image, 460, 160)),
    loadVector(assets.wing, wingInk('#d4d4d4')),
    loadVector(assets.wing, wingInk('#000000')),
  ]);

  /** @type {THREE.Texture[]} */
  const disposable = [];
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {boolean} [color]
   */
  const canvasTexture = (canvas, color = true) => {
    const texture = new THREE.CanvasTexture(canvas);
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    disposable.push(texture);
    return texture;
  };

  /** @param {boolean} [interference] */
  const makeGrain = (interference = false) => {
    const [canvas, ctx] = makeCanvas(512, 512);
    const pixels = ctx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const noise = ((x * 73 + y * 179 + x * y * 3) % 101) / 100;
      const wave = Math.sin(x * .019 + y * .012 + Math.sin(y * .016) * 2.4);
      const value = interference ? 128 + wave * 48 + noise * 18 : 125 + Math.sin(y * 1.7) * 19 + noise * 16;
      const index = (y * 512 + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = canvasTexture(canvas, false);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (!interference) texture.repeat.set(3, 3);
    return texture;
  };

  // Sunburst machining centered on the star: alternating wedges differ in
  // height and gloss, so the rays turn with the light.
  const makeGuilloche = () => {
    const [canvas, ctx] = makeCanvas(512, 512);
    const [cx, cy, wedges] = [256, 92, 120];
    for (let index = 0; index < wedges; index++) {
      ctx.beginPath();ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 760, index * 2 * Math.PI / wedges, (index + 1) * 2 * Math.PI / wedges + .002);
      ctx.fillStyle = index % 2 ? '#ffffff' : '#8c8c8c';ctx.fill();
    }
    ctx.strokeStyle = '#00000040';ctx.lineWidth = 2;
    for (let radius = 60; radius < 760; radius += 46) { ctx.beginPath();ctx.arc(cx, cy, radius, 0, Math.PI * 2);ctx.stroke(); }
    return canvasTexture(canvas, false);
  };

  // 2/2 twill at true card scale: each tow is about 2 mm wide and crowned.
  const makeWeave = (cell = 32) => {
    const [tile, tileCtx] = makeCanvas(cell * 4, cell * 4);
    for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
      const warp = ((column - row) % 4 + 4) % 4 < 2;
      const [x, y] = [column * cell, row * cell];
      const crown = warp ? tileCtx.createLinearGradient(x, 0, x + cell, 0) : tileCtx.createLinearGradient(0, y, 0, y + cell);
      crown.addColorStop(0, '#9c9c9c');crown.addColorStop(.5, warp ? '#ffffff' : '#d0d0d0');crown.addColorStop(1, '#9c9c9c');
      tileCtx.fillStyle = crown;tileCtx.fillRect(x, y, cell, cell);
      tileCtx.fillStyle = '#0000000d';
      for (let fiber = 3; fiber < cell; fiber += 5) tileCtx.fillRect(warp ? x + fiber : x, warp ? y : y + fiber, warp ? 1 : cell, warp ? cell : 1);
    }
    const [canvas, ctx] = makeCanvas();
    ctx.fillStyle = /** @type {CanvasPattern} */ (ctx.createPattern(tile, 'repeat'));
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    return canvas;
  };

  const weave = makeWeave();
  const foilGrain = makeGrain();
  const interferenceMap = makeGrain(true);
  const guillocheMap = makeGuilloche();
  const insigniaTexel = () => [(INSIGNIA_AT.x + CARD_W / 2) / CARD_W * TEX_W, (1 - (INSIGNIA_AT.y + CARD_H / 2) / CARD_H) * TEX_H];

  // Altitude rings and the Exowing study are engraved, not printed: the same
  // path lowers the relief and polishes the groove, so they light up on tilt.
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} reverse
   * @param {boolean} groove
   * @param {number} ringAlpha
   * @param {number} wingAlpha
   */
  const drawEngraving = (ctx, reverse, groove, ringAlpha, wingAlpha) => {
    ctx.save();
    ctx.beginPath();ctx.roundRect(70, 70, TEX_W - 140, TEX_H - 140, 34);ctx.clip();
    if (!reverse) {
      const [cx, cy] = insigniaTexel();
      ctx.strokeStyle = groove ? '#000000' : '#d4d4d4';ctx.lineWidth = 2;
      for (let index = 0; index < 11; index++) {
        ctx.globalAlpha = ringAlpha * (index % 3 === 0 ? 1 : .55);
        ctx.beginPath();ctx.arc(cx, cy, 300 + index * 46, 0, Math.PI * 2);ctx.stroke();
      }
    }
    ctx.globalAlpha = wingAlpha;
    if (reverse) ctx.drawImage(groove ? wingShadow : wing, 700, 262, 1250, 729);
    else ctx.drawImage(groove ? wingShadow : wing, 545, 244, 1460, 852);
    ctx.restore();
  };

  // Relief and gloss share one map: weave crowns, tow valleys and engraved grooves.
  /** @param {boolean} reverse */
  const makeSurface = (reverse) => {
    const [canvas, ctx] = makeCanvas();
    ctx.drawImage(weave, 0, 0);
    drawEngraving(ctx, reverse, true, .5, .8);
    return canvasTexture(canvas, false);
  };

  /**
   * @param {Rank} rank
   * @param {boolean} reverse
   */
  const makeFace = (rank, reverse) => {
    const [canvas, ctx] = makeCanvas(TEX_W, TEX_H, textureResolution);
    if (rank.crystal) {
      // On crystal the map only tints what passes through: clear body, sapphire print.
      const glass = rank.glass ?? ORCHID;
      cutFacets(ctx, glass);
      drawEngraving(ctx, reverse, true, .16, reverse ? .5 : .28);
      // Print on a clear body needs more weight than print on carbon.
      const print = { color: glass.print, family: 'Aptos Mono', tracking: 3, weight: 700 };
      printFace(ctx, rank, reverse, print, print, `${glass.print}66`);
      return canvasTexture(canvas);
    }
    const base = ctx.createRadialGradient(TEX_W * .45, TEX_H * .4, 0, TEX_W * .45, TEX_H * .4, TEX_W * .75);
    base.addColorStop(0, '#0b0b0c');base.addColorStop(1, '#030303');
    ctx.fillStyle = base;ctx.fillRect(0, 0, TEX_W, TEX_H);
    // The weave is barely printed; the relief map does the real work.
    ctx.save();ctx.globalAlpha = .035;ctx.globalCompositeOperation = 'lighter';ctx.drawImage(weave, 0, 0);ctx.restore();
    if (rank.film && !reverse) {
      const [cx, cy] = insigniaTexel();
      const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, 900);
      haze.addColorStop(0, `${rank.film.haze}1c`);haze.addColorStop(1, `${rank.film.haze}00`);
      ctx.fillStyle = haze;ctx.fillRect(0, 0, TEX_W, TEX_H);
    }
    drawEngraving(ctx, reverse, false, .12, reverse ? .55 : .3);
    const mono = { color: '#a9a9a9', family: 'Aptos Mono', tracking: 3 };
    printFace(ctx, rank, reverse, mono, { ...mono, color: '#e6e6e6' }, '#ffffff30');
    return canvasTexture(canvas);
  };

  // Printed secondary text: the member block on the front, identity and edition on the reverse.
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Rank} rank
   * @param {boolean} reverse
   * @param {{ color: string, family: string, tracking: number, weight?: number }} mono
   * @param {{ color: string, family: string, tracking: number, weight?: number }} strong
   * @param {string} rule
   */
  const printFace = (ctx, rank, reverse, mono, strong, rule) => {
    const [left, right] = [128, 1920];
    if (reverse) {
      text(ctx, memberName, left, 1084, 34, { ...strong, tracking: 4, maxWidth: 900 });
      text(ctx, `Member ${number} / ${rank.label.toUpperCase()} / ${since.toUpperCase()}`, left, 1146, 30, mono);
      const edition = options.edition ?? (rank === RANKS.pioneer ? 'THE FIRST CHAPTER / 001' : '');
      text(ctx, footnote ? edition : '', right, 1084, 30, { ...mono, align: 'right' });
      text(ctx, footnote || edition, right, 1146, 30, { ...mono, align: 'right' });
    } else if (personal) {
      ctx.fillStyle = rule;ctx.fillRect(left, 968, right - left, 2);
      text(ctx, options.status ?? rank.status ?? (rank === RANKS.pioneer ? 'FOUNDING MEMBER' : 'MEMBER'), left, 1142, 30, { ...mono, tracking: 4 });
      text(ctx, 'MEMBER NO.', right, 1142, 30, { ...mono, tracking: 4, align: 'right' });
    }
  };

  // Brilliant-cut relief for the crystal finish: a flat table, then rings of
  // facets that each slope their own way, so every facet catches a different light.
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Glass | null} tint A palette paints each facet its own shade; `null` paints its slope.
   * @param {boolean} [flat] Paints each facet one flat, arbitrary level instead: an identity for per-facet effects.
   */
  const cutFacets = (ctx, tint, flat = false) => {
    const [light, deep, other, shade] = [new THREE.Color(tint?.light), new THREE.Color(tint?.deep), new THREE.Color(tint?.alt ?? tint?.deep), new THREE.Color()];
    /**
     * @param {number} amount
     * @param {boolean} [alternate]
     */
    const mix = (amount, alternate = false) => `#${shade.copy(light).lerp(alternate ? other : deep, amount).getHexString()}`;
    const [cx, cy] = [TEX_W / 2, TEX_H / 2];
    /** @type {[number, number, number][]} */
    const rings = [[.2, 8, 0], [.5, 8, .5], [.84, 16, 0], [1.25, 16, .5], [1.9, 32, 0]];
    /** @type {(ring: [number, number, number], index: number) => [number, number]} */
    const vertex = ([radius, count, phase], index) => {
      const angle = (index + phase) / count * Math.PI * 2;
      return [cx + Math.cos(angle) * radius * TEX_W / 2, cy + Math.sin(angle) * radius * TEX_H / 2 * 1.3];
    };
    ctx.fillStyle = tint ? mix(.08) : '#9a9a9a';ctx.fillRect(0, 0, TEX_W, TEX_H);
    // Identifier masks contain integer IDs, never antialiased blends between IDs.
    const identityPixels = flat ? ctx.createImageData(TEX_W, TEX_H) : null;
    const identityValues = identityPixels ? new Uint32Array(identityPixels.data.buffer) : null;
    let facet = 0;
    /** @param {[number, number][]} corners */
    const cut = (corners) => {
      if (identityValues) {
        paintFacetIdentity(identityValues, TEX_W, TEX_H, corners, (facet * 73) % 256);
        facet += 1;
        return;
      }
      const mx = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
      const my = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
      const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - mx, y - my)));
      const slope = Math.atan2(my - cy, mx - cx) + (facet % 2 ? .9 : -.9);
      const depth = .55 + .45 * ((facet * 37) % 10) / 10;
      const tilt = ctx.createLinearGradient(mx - Math.cos(slope) * reach, my - Math.sin(slope) * reach, mx + Math.cos(slope) * reach, my + Math.sin(slope) * reach);
      if (tint) {
        // Each facet holds a little more or less color, and fades across its own plane.
        const hold = .12 + .62 * depth * (facet % 3 === 0 ? 1 : .5);
        tilt.addColorStop(0, mix(hold * .4, facet % 2 === 1));tilt.addColorStop(1, mix(hold, facet % 2 === 1));
      } else {
        const [high, low] = [Math.round(154 + 90 * depth), Math.round(154 - 110 * depth)];
        tilt.addColorStop(0, `rgb(${high},${high},${high})`);tilt.addColorStop(1, `rgb(${low},${low},${low})`);
      }
      ctx.beginPath();ctx.moveTo(...corners[0]);ctx.lineTo(...corners[1]);ctx.lineTo(...corners[2]);ctx.closePath();
      ctx.fillStyle = tilt;ctx.fill();

      facet += 1;
    };
    for (let level = 0; level < rings.length - 1; level++) {
      const [inner, outer] = [rings[level], rings[level + 1]];
      for (let i = 0, j = 0; i < inner[1] || j < outer[1];) {
        const stepInner = i < inner[1] && (j >= outer[1] || (i + 1 + inner[2]) / inner[1] <= (j + 1 + outer[2]) / outer[1]);
        if (stepInner) { cut([vertex(inner, i), vertex(inner, i + 1), vertex(outer, j)]);i += 1; }
        else { cut([vertex(inner, i), vertex(outer, j), vertex(outer, j + 1)]);j += 1; }
      }
    }
    if (identityPixels) ctx.putImageData(identityPixels, 0, 0);
  };

  const makeFacetIdentities = () => {
    const [canvas, ctx] = makeCanvas();
    cutFacets(ctx, null, true);
    const identities = canvasTexture(canvas, false);
    // IDs are discrete: interpolating neighboring values invents bright seams.
    identities.magFilter = THREE.NearestFilter;
    identities.minFilter = THREE.NearestFilter;
    identities.generateMipmaps = false;
    return identities;
  };

  // Engraving on crystal is frosted: the grooves scatter light, the body stays clear.
  /** @param {boolean} reverse */
  const makeFrost = (reverse) => {
    const [canvas, ctx] = makeCanvas();
    ctx.fillStyle = '#141414';ctx.fillRect(0, 0, TEX_W, TEX_H);
    drawEngraving(ctx, reverse, false, .9, 1);
    return canvasTexture(canvas, false);
  };

  // A metal inlay: the painted mask becomes both the foil and its beveled relief.
  /**
   * @param {(ctx: CanvasRenderingContext2D) => void} draw
   * @returns {Foil}
   */
  const makeFoil = (draw) => {
    const [canvas, ctx] = makeCanvas(TEX_W, TEX_H, textureResolution);
    draw(ctx);
    const [relief, reliefCtx] = makeCanvas(TEX_W, TEX_H, textureResolution);
    reliefCtx.fillStyle = '#000000';reliefCtx.fillRect(0, 0, TEX_W, TEX_H);
    reliefCtx.filter = 'blur(2.5px)';
    reliefCtx.drawImage(canvas, 0, 0, TEX_W, TEX_H);
    // Printed tonal bands support the real environment reflections at the resting angle.
    ctx.globalCompositeOperation = 'source-in';
    const bands = ctx.createLinearGradient(0, 180, 1200, 920);
    for (const [offset, color] of /** @type {[number, string][]} */ ([[0, '#ffffff'], [.22, '#e3e6ea'], [.38, '#b9c0c9'], [.5, '#ffffff'], [.62, '#c9d0d9'], [.78, '#f3f4f6'], [1, '#c2c9d2']])) bands.addColorStop(offset, color);
    ctx.fillStyle = bands;ctx.fillRect(0, 0, TEX_W, TEX_H);
    return { map: canvasTexture(canvas), bump: canvasTexture(relief, false) };
  };

  /** @param {CanvasRenderingContext2D} ctx */
  const drawHairline = (ctx) => {
    ctx.strokeStyle = '#ffffff';ctx.lineWidth = 2.5;
    ctx.beginPath();ctx.roundRect(46, 46, TEX_W - 92, TEX_H - 92, 44);ctx.stroke();
  };

  const foilSweep = { value: 0 };
  /**
   * @param {Foil} foil
   * @param {string} color
   * @param {{ value: THREE.Color }} tint
   * @param {number} floor
   */
  const foilMaterial = (foil, color, tint, floor) => {
    const material = new THREE.MeshPhysicalMaterial({ map: foil.map, bumpMap: foil.bump, bumpScale: .12, color, metalness: 1, roughness: .26, anisotropy: .7, anisotropyRotation: .3, clearcoat: .5, clearcoatRoughness: .25, envMapIntensity: 1.4, transparent: true, alphaTest: .01, alphaToCoverage: true, depthWrite: false });
    // A legibility floor plus one narrow band that travels with the card's
    // orientation: the lettering never drops to black against the carbon.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFoilSweep = foilSweep;
      shader.uniforms.uFoilTint = tint;
      shader.fragmentShader = `uniform float uFoilSweep;\nuniform vec3 uFoilTint;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float foilBand = pow(0.5 + 0.5 * sin(vMapUv.y * 7.0 + vMapUv.x * 3.0 + uFoilSweep), 16.0);
        totalEmissiveRadiance += uFoilTint * diffuseColor.rgb * (${floor.toFixed(2)} + foilBand * 0.75);
      `);
    };
    material.customProgramCacheKey = () => `flightclub-foil-${floor}`;
    return material;
  };

  // A dark studio with a few long softboxes. Metals reflect shape and gradient
  // instead of the even white of a bright room.
  /** @param {THREE.WebGLRenderer} target */
  const makeEnvironment = (target) => {
    const studio = new THREE.Scene();
    const dome = new THREE.SphereGeometry(40, 48, 24);
    /** @type {number[]} */
    const shade = [];
    for (let index = 0; index < dome.attributes.position.count; index++) {
      const level = .05 + .34 * THREE.MathUtils.smoothstep(dome.attributes.position.getY(index) / 40, -.5, .9);
      shade.push(level, level, level);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    studio.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    // [x, y, z, width, height, intensity]: strips sit 20 to 40 degrees off the
    // viewing axis, where pointer tilt sweeps them across the inlays.
    for (const [x, y, z, w, h, intensity] of [[-9, 5, 14, 2.4, 16, 7], [11, 2, 13, 1.6, 14, 5], [0, 12, 12, 18, 2.2, 6], [2, -9, 12, 14, 1, 1.6], [0, 1, 20, 9, 6, .55]]) {
      const softbox = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }));
      softbox.position.set(x, y, z);softbox.lookAt(0, 0, 0);studio.add(softbox);
    }
    const pmrem = new THREE.PMREMGenerator(target);
    const result = pmrem.fromScene(studio, .03);
    pmrem.dispose();
    disposeTree(studio);
    return result;
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 100);
  camera.position.set(0, 0, 13.4);
  const environment = makeEnvironment(renderer);
  scene.environment = environment.texture;
  // The key light follows the pointer, so the hand moves the highlight too.
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  scene.add(key);
  const edge = new THREE.DirectionalLight('#ffffff', 1.6);
  edge.position.set(8, 3, 1);scene.add(edge);
  scene.add(new THREE.AmbientLight('#ffffff', .2));
  const card = new THREE.Group();
  scene.add(card);
  const shellMaterial = new THREE.MeshPhysicalMaterial({ color: RANKS[activeRank].shell, metalness: 1, roughness: .27, iridescence: .6, clearcoat: 1 });
  const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(CARD_W, CARD_H, .28), { depth: .065, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 4, curveSegments: 24, steps: 1 }), shellMaterial);
  shell.position.z = -.033;
  card.add(shell);
  // A neutral studio backing preserves the crystal finish on every page.
  // It exists only in the transmission pass and never paints the canvas.
  const backdropMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(options.transmissionBacking ?? '#f5f4f0').multiplyScalar(2.4), depthWrite: false, toneMapped: false });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), backdropMaterial);
  backdrop.position.z = -5;backdrop.visible = false;
  backdrop.onBeforeRender = (target) => { backdropMaterial.colorWrite = target.getRenderTarget() !== null; };
  scene.add(backdrop);

  // Rank textures are painted on first use so the member's own card appears sooner.
  /** @type {Map<RankKey, THREE.CanvasTexture>} */
  const frontMaps = new Map();
  /** @type {Map<RankKey, THREE.CanvasTexture>} */
  const backMaps = new Map();
  /** @type {Map<RankKey, Foil>} */
  const rankMaps = new Map();
  /** @param {RankKey} rankKey */
  const rankTextures = (rankKey) => {
    if (!frontMaps.has(rankKey)) {
      frontMaps.set(rankKey, makeFace(RANKS[rankKey], false));
      backMaps.set(rankKey, makeFace(RANKS[rankKey], true));
      rankMaps.set(rankKey, makeFoil((ctx) => {
        text(ctx, RANKS[rankKey].label.toUpperCase(), 128, 806, 60, { family: 'Aptos Mono', tracking: 6 });
        if (personal) text(ctx, 'MEMBER', 1742, 1072, 30, { family: 'Aptos Mono', tracking: 4, align: 'right' });
      }));
    }
    return {
      front: /** @type {THREE.CanvasTexture} */ (frontMaps.get(rankKey)),
      back: /** @type {THREE.CanvasTexture} */ (backMaps.get(rankKey)),
      foil: /** @type {Foil} */ (rankMaps.get(rankKey)),
    };
  };

  const first = rankTextures(activeRank);
  /**
   * @param {boolean} reverse
   * @param {THREE.CanvasTexture} map
   */
  const faceMaterial = (reverse, map) => {
    const surface = makeSurface(reverse);
    return new THREE.MeshPhysicalMaterial({ map, metalness: 0, roughness: .7, roughnessMap: surface, bumpMap: surface, bumpScale: .08, specularIntensity: .6, envMapIntensity: .45 });
  };
  const frontMaterial = faceMaterial(false, first.front);
  const front = new THREE.Mesh(faceGeometry(), frontMaterial);
  front.position.z = .06;card.add(front);
  // Crystal substrate, built on first use: clear faces cut in facets with
  // frosted engraving, and a thicker, more dispersive edge.
  /** @typedef {{ front: THREE.MeshPhysicalMaterial, back: THREE.MeshPhysicalMaterial, shell: THREE.MeshPhysicalMaterial }} Substrate */
  /** @type {Map<Glass, Substrate>} */
  const crystals = new Map();
  /** @param {Glass} glass */
  const crystalMaterials = (glass) => {
    const cut = crystals.get(glass);
    if (cut) return cut;
    /** @param {boolean} reverse */
    const face = (reverse) => new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: .55, roughnessMap: makeFrost(reverse), transmission: 1, thickness: .5, ior: 2.1, attenuationColor: glass.body, attenuationDistance: .8, dispersion: 6, iridescence: glass.fire, iridescenceIOR: 1.6, clearcoat: glass.gloss, clearcoatRoughness: .03, specularIntensity: glass.gloss, envMapIntensity: glass.shine });
    const shellCrystal = new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: .02, transmission: 1, thickness: .8, ior: 2.2, attenuationColor: glass.edge, attenuationDistance: .22, dispersion: 9, iridescence: .7, iridescenceIOR: 1.7, clearcoat: 1, envMapIntensity: 2.2 });
    /** @type {Substrate} */
    const crystal = { front: face(false), back: face(true), shell: shellCrystal };
    for (const material of Object.values(crystal)) filmThickness(material, 280, 760);
    if (glass.sparkle) {
      // Scintillation: every facet has its own angle at which it flares pale
      // violet, so light runs from facet to facet as the card moves.
      const identities = { value: makeFacetIdentities() };
      const strength = glass.sparkle.toFixed(2);
      for (const material of [crystal.front, crystal.back]) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uFoilSweep = foilSweep;
          shader.uniforms.uFacets = identities;
          shader.fragmentShader = `uniform float uFoilSweep;\nuniform sampler2D uFacets;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', `
            #include <emissivemap_fragment>
            float flare = pow(0.5 + 0.5 * sin(texture2D(uFacets, vMapUv).g * 61.0 + uFoilSweep * 1.7), 16.0);
            totalEmissiveRadiance += vec3(0.78, 0.66, 1.0) * flare * ${strength};
          `);
        };
        material.customProgramCacheKey = () => `flightclub-crystal-sparkle-${strength}`;
      }
    }
    crystals.set(glass, crystal);
    return crystal;
  };
  const silver = { value: new THREE.Color('#e7edf6') };
  /**
   * @param {THREE.Material} material
   * @param {number} z
   * @param {number} order
   * @param {boolean} [reverse]
   */
  const inlay = (material, z, order, reverse = false) => {
    const mesh = new THREE.Mesh(faceGeometry(), material);
    mesh.position.z = z;mesh.renderOrder = order;
    if (reverse) mesh.rotation.y = Math.PI;
    card.add(mesh);
  };
  // The hairline is a clean antialiased inlay, without a bump map that can
  // turn its subpixel edge into alternating bright and dark fragments.
  const [hairlineCanvas, hairlineCtx] = makeCanvas(TEX_W, TEX_H, textureResolution);
  drawHairline(hairlineCtx);
  const hairline = new THREE.MeshBasicMaterial({ map: canvasTexture(hairlineCanvas), color: '#e6e2f5', transparent: true, opacity: .75, depthWrite: false });
  inlay(hairline, .071, 3);
  inlay(hairline, -.075, 3, true);
  const frontInk = foilMaterial(makeFoil((ctx) => {
    ctx.drawImage(wordmark, 128, 116, 420, 42);
    ctx.drawImage(monogram, 1690, 98, 230, 80);
    text(ctx, 'FLIGHT', 116, 490, 192, { family: 'Aptos Display', tracking: -7 });
    text(ctx, 'CLUB', 116, 674, 192, { family: 'Aptos Display', tracking: -7 });
    if (!personal) return;
    text(ctx, memberName, 128, 1072, 50, { tracking: 2, maxWidth: 1250 });
    text(ctx, number, 1920, 1072, 50, { family: 'Aptos Mono', tracking: 3, align: 'right' });
  }), '#d6dbe2', silver, .5);
  inlay(frontInk, .067, 1);
  const rankTint = { value: new THREE.Color(RANKS[activeRank].color) };
  const rankMaterial = foilMaterial(first.foil, RANKS[activeRank].metal, rankTint, .8);
  rankMaterial.iridescenceThicknessMap = interferenceMap;
  inlay(rankMaterial, .069, 2);
  const backMaterial = faceMaterial(true, first.back);
  const back = new THREE.Mesh(faceGeometry(), backMaterial);
  back.rotation.y = Math.PI;back.position.z = -.066;card.add(back);
  const backInk = foilMaterial(makeFoil((ctx) => {
    ctx.drawImage(wordmark, 128, 116, 340, 34);
    text(ctx, 'THE STORY IS', 122, 372, 96, { family: 'Aptos Display', tracking: -2 });
    text(ctx, 'OURS TO WRITE.', 122, 478, 96, { family: 'Aptos Display', tracking: -2 });
  }), '#d6dbe2', silver, .5);
  inlay(backInk, -.073, 1, true);

  let insignia = new THREE.Group();
  /** @param {Rank} rank */
  const buildInsignia = (rank) => {
    card.remove(insignia);
    disposeTree(insignia);
    insignia = new THREE.Group();
    insignia.position.set(INSIGNIA_AT.x, INSIGNIA_AT.y, INSIGNIA_Z);
    const isPioneer = rank.film !== undefined;
    const [rimFilm, fieldFilm] = [rank.film?.rim ?? [240, 480], rank.film?.field ?? [330, 470]];
    const isCrystal = rank.crystal === true;
    const glass = rank.glass ?? ORCHID;
    /** @param {number} strength */
    const film = (strength) => ({ iridescence: isPioneer || isCrystal ? strength : FILM_OFF, iridescenceIOR: 1.38, iridescenceThicknessMap: interferenceMap });
    const rimMaterial = new THREE.MeshPhysicalMaterial({ color: rank.rim ?? rank.metal, metalness: 1, roughness: .3, bumpMap: foilGrain, bumpScale: .035, anisotropy: .5, clearcoat: .3, clearcoatRoughness: .3, ...film(1) });
    // The recessed field is a guilloche sunburst under a satin film: it stays
    // dark at rest and opens up when the card tilts.
    const fieldMaterial = new THREE.MeshPhysicalMaterial({ color: rank.field, metalness: 1, roughness: .62, roughnessMap: guillocheMap, bumpMap: guillocheMap, bumpScale: .08, envMapIntensity: isPioneer || isCrystal ? 1.5 : 1.1, emissive: rank.film?.glow ?? (isCrystal ? glass.glow : '#000000'), emissiveIntensity: .35, ...film(isCrystal ? glass.fieldFilm : .5), iridescenceIOR: 1.5 });
    const deviceMaterial = new THREE.MeshPhysicalMaterial({ color: rank.device, metalness: 1, roughness: isCrystal ? .05 : .24, envMapIntensity: isCrystal ? 2.6 : 1.5, emissive: isCrystal ? glass.gemGlow : '#000000', emissiveIntensity: .16, vertexColors: true, clearcoat: .2, clearcoatRoughness: .2, ...film(isCrystal ? .9 : .45) });
    filmThickness(rimMaterial, rimFilm[0], rimFilm[1]);filmThickness(fieldMaterial, fieldFilm[0], fieldFilm[1]);filmThickness(deviceMaterial, rimFilm[0], rimFilm[1]);
    const shieldPoints = [[0, 1.38], [1.05, .94], [.91, -.65], [0, -1.32], [-.91, -.65], [-1.05, .94]];
    const frame = polygon(shieldPoints);
    frame.holes.push(polygon(shieldPoints.map(([x, y]) => [x * .9, y * .9]).reverse()));
    insignia.add(new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: .05, bevelEnabled: true, bevelThickness: .022, bevelSize: .022, bevelSegments: 3, steps: 1 }), rimMaterial));
    const field = new THREE.Mesh(mapToBounds(new THREE.ShapeGeometry(polygon(shieldPoints.map(([x, y]) => [x * .93, y * .93])))), fieldMaterial);
    field.position.z = .02;
    insignia.add(field);
    // Every rank carries the same device: the Exowing, cut in facets. Ranks
    // differ by their metal or crystal, not by a count of stripes.
    const facets = wingFacets(0, .98);
    const tones = facetTones(facets, isCrystal ? glass.gemLight : '#ffffff', isCrystal ? glass.gemDeep : '#b4b4b4');
    const device = new THREE.Mesh(facetGeometry(facets, tones), deviceMaterial);
    device.position.z = .022;
    insignia.add(device);
    card.add(insignia);
  };

  /** @param {RankKey} rankKey */
  const applyRank = (rankKey) => {
    const rank = RANKS[rankKey];
    const textures = rankTextures(rankKey);
    /** @type {Substrate} */
    const substrate = rank.crystal ? crystalMaterials(rank.glass ?? ORCHID) : { front: frontMaterial, back: backMaterial, shell: shellMaterial };
    front.material = substrate.front;back.material = substrate.back;shell.material = substrate.shell;
    backdrop.visible = rank.crystal === true;
    substrate.front.map = textures.front;
    substrate.back.map = textures.back;
    shellMaterial.color.set(rank.shell);
    shellMaterial.iridescence = rank.film ? .6 : FILM_OFF;
    filmThickness(shellMaterial, ...(rank.film?.rim ?? [100, 400]));
    filmThickness(rankMaterial, ...(rank.film?.label ?? [180, 620]));
    // Lettering turns to sapphire on crystal, where silver would vanish.
    frontInk.color.set(rank.ink ?? '#d6dbe2');backInk.color.set(rank.ink ?? '#d6dbe2');
    silver.value.set(rank.inkTint ?? '#e7edf6');
    rankMaterial.map = textures.foil.map;
    rankMaterial.bumpMap = textures.foil.bump;
    rankMaterial.color.set(rank.metal);
    rankMaterial.iridescence = rank.film ? .8 : FILM_OFF;
    rankTint.value.set(rank.color);
    buildInsignia(rank);
  };
  applyRank(activeRank);

  // A soft contact shadow grounds the floating object without an expensive shadow pass.
  const [shadowCanvas, shadowCtx] = makeCanvas(256, 256);
  const shadowGradient = shadowCtx.createRadialGradient(128, 128, 5, 128, 128, 128);
  shadowGradient.addColorStop(0, '#00000059');shadowGradient.addColorStop(.5, '#0000001c');shadowGradient.addColorStop(1, '#00000000');
  shadowCtx.fillStyle = shadowGradient;shadowCtx.fillRect(0, 0, 256, 256);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: canvasTexture(shadowCanvas), transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.2), shadowMaterial);
  shadow.position.set(0, -3.15, -1);scene.add(shadow);
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = Math.max(13.4, 17.4 / camera.aspect);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);observer.observe(host);resize();

  // Pose: springs for the turn, an eased pointer tilt and the welcome timeline.
  const yaw = { x: REST_YAW, v: 0 };
  const pitch = { x: 0, v: 0 };
  const hover = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  const restEuler = new THREE.Euler();
  const hoverEuler = new THREE.Euler();
  const hoverRotation = new THREE.Quaternion();
  const revealRotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const faceNormal = new THREE.Vector3();
  let faceIndex = 0;
  let revealAt = -100;
  let wasStruck = true;
  let previousTime = performance.now();
  /** @type {{ id: number, x: number, y: number, yaw: number, time: number, velocity: number, moved: boolean } | null} */
  let drag = null;
  const isFlipped = () => Math.abs(faceIndex % 2) === 1;
  const restYaw = () => faceIndex * Math.PI + REST_YAW;
  const settle = () => { pointer.x = pointer.y = 0;revealAt = -100; };
  /** @param {() => void} change */
  const changeFace = (change) => {
    const before = isFlipped();
    change();
    if (isFlipped() !== before) onFace?.(isFlipped());
  };

  /**
   * @param {number} time
   * @param {number} elapsed
   */
  const pose = (time, elapsed) => {
    const still = reducedMotion.matches;
    const clock = still ? 100 : Math.max(0, time - revealAt);
    /** @type {(from: number, length: number) => number} */
    const span = (from, length) => THREE.MathUtils.clamp((clock - from) / length, 0, 1);
    const rising = Math.pow(1 - span(0, 1.7), 3);
    const lit = THREE.MathUtils.smoothstep(clock, .1, 1.25);
    const formed = span(.6, .35);
    const aloft = 1 - Math.pow(span(IMPACT - .42, .42), 3);
    const struck = clock >= IMPACT;
    // The landing pushes the card back; the springs absorb it.
    if (struck && !wasStruck && clock < IMPACT + .2) { pitch.v += 2.1;yaw.v -= 1.1; }
    wasStruck = struck;
    if (still) { yaw.x = restYaw();yaw.v = 0;pitch.x = 0;pitch.v = 0; }
    else if (!drag) {
      // An underdamped spring gives the turn weight and a slight overshoot.
      for (let steps = Math.max(1, Math.ceil(elapsed * 120)), step = 0; step < steps; step++) {
        const dt = elapsed / steps;
        yaw.v += (-90 * (yaw.x - restYaw()) - 13 * yaw.v) * dt;yaw.x += yaw.v * dt;
        pitch.v += (-120 * pitch.x - 16 * pitch.v) * dt;pitch.x += pitch.v * dt;
      }
    }
    const ease = still ? 1 : 1 - Math.exp(-7 * elapsed);
    hover.x += ((drag ? 0 : pointer.x) - hover.x) * ease;
    hover.y += ((drag ? 0 : pointer.y) - hover.y) * ease;
    // Once the insignia is seated, one full turn presents both faces and
    // settles back on the front.
    const turn = span(IMPACT + .55, TURN);
    const presented = turn < .5 ? 4 * turn ** 3 : 1 - Math.pow(-2 * turn + 2, 3) / 2;
    restEuler.set(DEFAULT_TILT + pitch.x, yaw.x + presented * Math.PI * 2, -.055);
    card.quaternion.setFromEuler(restEuler);
    if (!still) {
      hoverEuler.set(hover.y * .15, hover.x * .23, -hover.x * .025);
      card.quaternion.premultiply(hoverRotation.setFromEuler(hoverEuler));
      if (rising > 0) card.quaternion.premultiply(revealRotation.setFromAxisAngle(upAxis, -.18 * rising));
    }
    faceNormal.set(0, 0, 1).applyQuaternion(card.quaternion);
    // The landing releases one pass of light across the lettering and a brief glint.
    foilSweep.value = faceNormal.x * 4.5 - faceNormal.y * 3.5 + 9 * Math.pow(1 - span(IMPACT, 1.5), 3);
    renderer.toneMappingExposure = EXPOSURE * (.1 + .9 * lit) * (1 + (struck ? .4 * Math.exp(-(clock - IMPACT) * 6) : 0));
    // The insignia forms above the card, then accelerates into its seat.
    insignia.position.z = INSIGNIA_Z + 1.5 * aloft;
    insignia.scale.setScalar(Math.max(.0001, formed * (2 - formed)) * (1 + .28 * aloft));
    // Crystal is see-through: from behind, the insignia would sit under the motto.
    insignia.visible = !backdrop.visible || faceNormal.z > -.05;
    key.position.set(-5 + hover.x * 7, 7 - hover.y * 6, 5);
    const float = still ? 0 : .08 + Math.sin(time * .7) * .065;
    card.position.y = float - rising * 1.1;
    card.scale.setScalar(1 - .22 * rising);
    // The shadow narrows as the card turns edge-on and softens as it rises.
    shadow.scale.x = .28 + .72 * Math.abs(faceNormal.z);
    shadowMaterial.opacity = (1 - rising) * lit * (1 - float * 1.6);
  };

  // Rendering stops whenever the stage is off screen or the tab is hidden.
  let frameId = 0;
  let onScreen = true;
  let disposed = false;
  /** @param {number} now */
  const animate = (now) => {
    const elapsed = Math.min((now - previousTime) / 1000, .05);previousTime = now;
    pose(now / 1000, elapsed);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  };
  const sync = () => {
    cancelAnimationFrame(frameId);
    if (!disposed && onScreen && !document.hidden) { previousTime = performance.now();frameId = requestAnimationFrame(animate); }
  };
  const viewport = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting;sync(); });
  viewport.observe(host);
  document.addEventListener('visibilitychange', sync, { signal });

  host.addEventListener('pointermove', (event) => {
    const bounds = host.getBoundingClientRect();
    if (drag?.id === event.pointerId) {
      const [dx, dy] = [event.clientX - drag.x, event.clientY - drag.y];
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      const turned = drag.yaw + dx * 2.6 / bounds.width * Math.PI;
      const dt = Math.max(8, event.timeStamp - drag.time) / 1000;
      drag.velocity += ((turned - yaw.x) / dt - drag.velocity) * .5;
      drag.time = event.timeStamp;
      yaw.x = turned;
      // Vertical travel is rubber-banded: the card leans, it never tumbles.
      pitch.x = .42 * Math.tanh(dy / bounds.height * 2.2);
      return;
    }
    if (event.pointerType === 'touch') return;
    pointer.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    pointer.y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  }, { signal });
  host.addEventListener('pointerleave', () => { pointer.x = 0;pointer.y = 0; }, { signal });
  const raycaster = new THREE.Raycaster();
  /** @param {PointerEvent} event */
  const overCard = (event) => {
    const bounds = host.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), camera);
    return raycaster.intersectObject(shell).length > 0;
  };
  host.addEventListener('pointerdown', (event) => {
    if (!dragToTurn || event.button !== 0 || drag || reducedMotion.matches || !overCard(event)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: yaw.x, time: event.timeStamp, velocity: 0, moved: false };
    revealAt = -100;
    host.setPointerCapture(event.pointerId);
    host.dataset.dragging = 'true';
  }, { signal });
  /** @param {PointerEvent} event */
  const release = (event) => {
    if (drag?.id !== event.pointerId) return;
    const { moved, velocity, time } = drag;
    drag = null;
    delete host.dataset.dragging;
    changeFace(() => {
      if (event.type === 'pointerup' && !moved) { faceIndex += 1;return; }
      // A flick carries the card one face further at most; a short pull falls back.
      yaw.v = event.timeStamp - time < 80 ? THREE.MathUtils.clamp(velocity, -9, 9) : 0;
      const nearest = Math.round((yaw.x - REST_YAW) / Math.PI);
      faceIndex = THREE.MathUtils.clamp(Math.round((yaw.x + yaw.v * .16 - REST_YAW) / Math.PI), nearest - 1, nearest + 1);
    });
  };
  host.addEventListener('pointerup', release, { signal });
  host.addEventListener('pointercancel', release, { signal });

  const context = renderer.domElement;
  context.addEventListener('webglcontextlost', (event) => { event.preventDefault();onScreen = false;sync();host.dataset.scene = 'lost'; }, { signal });
  context.addEventListener('webglcontextrestored', () => location.reload(), { signal });

  // Other finishes are painted and uploaded one per idle slot, so the first
  // preview of each rank is as immediate as the member's own card.
  /** @type {(task: () => void) => void} */
  const idle = (task) => { if ('requestIdleCallback' in window) requestIdleCallback(task);else setTimeout(task, 200); };
  /** @param {RankKey[]} keys */
  const warm = (keys) => {
    if (!keys.length || disposed) return;
    idle(() => {
      if (disposed) return;
      const textures = rankTextures(keys[0]);
      for (const texture of [textures.front, textures.back, textures.foil.map, textures.foil.bump]) renderer.initTexture(texture);
      warm(keys.slice(1));
    });
  };

  sync();
  host.dataset.scene = 'ready';

  return {
    reveal(delaySeconds = 0) {
      changeFace(() => { if (isFlipped()) faceIndex += 1; });
      settle();
      revealAt = performance.now() / 1000 + (reducedMotion.matches ? 0 : delaySeconds);
    },
    setRank(rankKey) {
      const changed = rankKey !== activeRank;
      activeRank = rankKey;
      changeFace(() => { if (isFlipped()) faceIndex += 1; });
      settle();
      applyRank(rankKey);
      // A short nod marks the new finish.
      if (changed && !reducedMotion.matches) yaw.v += 1.8;
      warm(/** @type {RankKey[]} */ (Object.keys(RANKS)).filter((candidate) => !frontMaps.has(candidate)));
    },
    turn() {
      changeFace(() => { faceIndex += 1; });
      settle();
    },
    isFlipped,
    snapshot({ tier = activeRank, background, type = 'image/png', quality } = {}) {
      const pixelWidth = context.width;
      const pixelHeight = context.height;
      if (!pixelWidth || !pixelHeight) return null;
      if (tier !== activeRank) applyRank(tier);
      // The capture is the card at rest, whatever the live pose is.
      card.quaternion.setFromEuler(restEuler.set(DEFAULT_TILT, REST_YAW, -.055));
      card.position.y = 0;card.scale.setScalar(1);
      shadow.visible = Boolean(background);shadow.scale.x = 1;shadowMaterial.opacity = 1;
      key.position.set(-5, 7, 5);foilSweep.value = -.6;
      renderer.toneMappingExposure = EXPOSURE;insignia.position.z = INSIGNIA_Z;insignia.scale.setScalar(1);
      renderer.render(scene, camera);
      const bounds = new THREE.Box3().setFromObject(card);
      if (background) bounds.expandByObject(shadow);
      /** @type {THREE.Vector3[]} */
      const corners = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).project(camera));
      const left = Math.max(0, (Math.min(...corners.map((point) => point.x)) + 1) / 2 * pixelWidth - 8);
      const top = Math.max(0, (1 - Math.max(...corners.map((point) => point.y))) / 2 * pixelHeight - 8);
      const width = Math.min(pixelWidth - left, (Math.max(...corners.map((point) => point.x)) + 1) / 2 * pixelWidth - left + 8);
      const height = Math.min(pixelHeight - top, (1 - Math.min(...corners.map((point) => point.y))) / 2 * pixelHeight - top + 8);
      const [image, imageCtx] = makeCanvas(Math.ceil(width), Math.ceil(height));
      if (background) { imageCtx.fillStyle = background;imageCtx.fillRect(0, 0, image.width, image.height); }
      imageCtx.drawImage(context, left, top, width, height, 0, 0, width, height);
      shadow.visible = true;
      if (tier !== activeRank) applyRank(activeRank);
      return image.toDataURL(type, quality);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);lifetime.abort();observer.disconnect();viewport.disconnect();
      disposeTree(scene);
      for (const material of [frontMaterial, backMaterial, shellMaterial, ...[...crystals.values()].flatMap((substrate) => Object.values(substrate))]) material.dispose();
      for (const texture of disposable) texture.dispose();
      environment.dispose();renderer.dispose();context.remove();
    },
  };
}
