/**
 * GlyphViz CSV export.
 *
 * Emits the four-file GlyphViz set (a compact descendant of the ANTz CSV
 * format):
 *   <name>_gv_node.csv      — the glyph scene graph
 *   <name>_gv_tag.csv       — text tags keyed by node record id
 *   <name>_gv_ch-map.csv    — channel → node-attribute wiring
 *   <name>_gv_ch-tracks.csv — per-cycle channel values (animation data)
 *
 * HCS encoding follows the original PHP/ANTz generators:
 *   - Each dimension is a toroid (topo 3, geometry 7). A child placed on a
 *     toroid at translate_x = θ sits at longitude θ on the parent ring, and
 *     its own ring wraps the parent tube — exactly the torus-cross-section
 *     nesting the in-app geometry engine uses.
 *   - translate_x carries the HCS angle θ = 180·(v/s)/(1+|v/s|).
 *   - The data point itself is an octahedron leaf (geometry 11, topo 7) at
 *     the center of the innermost toroid.
 *   - Dimension toroids are colored R,G,B,C,M,Y in dimension order; leaves
 *     get the red→purple rainbow time ramp (matching the app's rendering).
 *   - Dimension toroids are typically hidden (hide=1) so only the data
 *     cloud shows; un-hide in GlyphViz to inspect the scaffolding.
 *
 * Optionally an "animated probe" chain is added: one toroid chain whose
 * translate_x on every level is driven by a channel, with ch-tracks rows
 * containing each data row's angles. Playing the channels in GlyphViz sweeps
 * the probe through the dataset — the trajectory replayed as animation.
 */

import { valueToAngle } from '../hcs/mapping';
import type { HCSConfig } from '../hcs/geometry';
import type { Dataset } from '../data/demos';

export const NODE_HEADER =
  'id,type,parent_id,branch_level,translate_x,translate_y,translate_z,rotate_x,rotate_y,rotate_z,' +
  'scale_x,scale_y,scale_z,color_r,color_g,color_b,color_a,geometry,hide,topo,ratio,texture_id,ch_input_id';
export const TAG_HEADER = 'id,table_id,record_id,title';
export const CHMAP_HEADER = 'id,channel_id,track_id,attribute,track_table_id,ch_map_table_id,record_id';

// ANTz/GlyphViz enums used here.
const TYPE_PIN = 5;
const GEO_TOROID = 7;
const GEO_OCTAHEDRON = 11;
const TOPO_TOROID = 3;
const TOPO_POINT = 7;

/** Dimension circle colors: R, G, B, C, M, Y — same order as the viewer. */
const DIM_RGB: Array<[number, number, number]> = [
  [255, 34, 34],
  [34, 204, 34],
  [51, 102, 255],
  [0, 204, 204],
  [204, 0, 204],
  [204, 204, 0],
];

// Scale constants carried over from the proven PHP generators
// (branch_level_scale, global_scale, pow_var, point_scale). ANTz/GlyphViz
// auto-shrinks nested topo children, so these compensate per level.
const LEVEL1_SCALE = 4 + Math.pow(1, 0.25); // 5
const GLOBAL_SCALE = 0.1;
const POW_VAR = 0.25;
const POINT_SCALE = 0.25;

export interface GlyphVizExportOptions {
  /** Hide the dimension toroids so only leaves show (default true). */
  hideDimensions: boolean;
  /** Add the channel-animated probe chain + ch-map/ch-tracks data. */
  includeChannels: boolean;
  /** Write a tag per data point (id, values). Root tag is always written. */
  tagPoints: boolean;
  /** Cap on exported rows (GlyphViz node counts grow as rows × dims). */
  maxRows: number;
}

export const DEFAULT_EXPORT_OPTIONS: GlyphVizExportOptions = {
  hideDimensions: true,
  includeChannels: true,
  tagPoints: true,
  maxRows: 20000,
};

export interface GlyphVizFiles {
  node: string;
  tag: string;
  chMap: string;
  chTracks: string;
  /** Rows actually exported (after NaN filtering and maxRows). */
  rowsExported: number;
  nodeCount: number;
}

/** Leaf color: same red→purple HSL ramp as HCSViewer.timeColor. */
export function leafRGB(i: number, total: number): [number, number, number] {
  const t = total > 1 ? i / (total - 1) : 0;
  return hslToRgb255(0.83 * t, 1.0, 0.55);
}

function hslToRgb255(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, tt: number): number => {
    let t = tt;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function scaleForLevel(level: number): number {
  // level 1 = first dimension toroid on the root; deeper levels shrink.
  return level === 1 ? LEVEL1_SCALE : GLOBAL_SCALE + Math.pow(level, POW_VAR);
}

const LEAF_SCALE = GLOBAL_SCALE + Math.pow(POINT_SCALE, POW_VAR);

function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '180' : '-180';
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
}

interface NodeRow {
  id: number;
  parentId: number;
  branchLevel: number;
  tx: number;
  ty: number;
  tz: number;
  scale: number;
  rgb: [number, number, number];
  geometry: number;
  hide: 0 | 1;
  topo: number;
  ratio: number;
  chInputId: number;
}

function nodeLine(n: NodeRow): string {
  return [
    n.id,
    TYPE_PIN,
    n.parentId,
    n.branchLevel,
    fmt(n.tx),
    fmt(n.ty),
    fmt(n.tz),
    0,
    0,
    0, // rotate x,y,z
    fmt(n.scale),
    fmt(n.scale),
    fmt(n.scale),
    n.rgb[0],
    n.rgb[1],
    n.rgb[2],
    255,
    n.geometry,
    n.hide,
    n.topo,
    n.ratio,
    0, // texture_id
    n.chInputId,
  ].join(',');
}

function csvQuote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build the full GlyphViz file set for a dataset under an HCS config.
 * Angles are computed with the same valueToAngle/scales as the on-screen
 * plot, so what you see is what GlyphViz gets.
 */
export function buildGlyphVizFiles(
  dataset: Dataset,
  cfg: HCSConfig,
  datasetName: string,
  opts: Partial<GlyphVizExportOptions> = {},
): GlyphVizFiles {
  const o = { ...DEFAULT_EXPORT_OPTIONS, ...opts };

  // Keep only fully-numeric rows (±Infinity is fine — it maps to ±180°).
  const rows: number[][] = [];
  for (const r of dataset.rows) {
    if (r.length > 0 && r.every((v) => !Number.isNaN(v))) rows.push(r);
    if (rows.length >= o.maxRows) break;
  }
  const nDims = rows[0]?.length ?? 0;
  const scaleAt = (d: number): number => {
    const s = cfg.scales[d];
    return Number.isFinite(s) && s > 0 ? s : 1;
  };

  const nodeLines: string[] = [NODE_HEADER];
  const tagLines: string[] = [TAG_HEADER];
  const chMapLines: string[] = [CHMAP_HEADER];
  const trackLines: string[] = [];

  let id = 0;
  let tagId = 0;

  const addTag = (recordId: number, title: string): void => {
    tagLines.push(`${tagId},0,${recordId},${csvQuote(title)}`);
    tagId++;
  };

  // Root toroid — the dimension-1 circle every row hangs off.
  const rootId = ++id;
  nodeLines.push(
    nodeLine({
      id: rootId,
      parentId: 0,
      branchLevel: 0,
      tx: 0,
      ty: 0,
      tz: 0,
      scale: 1,
      rgb: DIM_RGB[0],
      geometry: GEO_TOROID,
      hide: 0,
      topo: TOPO_TOROID,
      ratio: 0.01,
      chInputId: 0,
    }),
  );
  const dimNames = dataset.columnNames.length ? dataset.columnNames.join(', ') : `${nDims} dimensions`;
  addTag(rootId, `HCS: ${datasetName} — ${rows.length} points × ${nDims} dims (${dimNames})`);

  // Static data glyphs: per row, a toroid chain (one per dimension) with an
  // octahedron leaf at the center of the innermost toroid.
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    let parent = rootId;
    for (let d = 0; d < nDims; d++) {
      const theta = valueToAngle(row[d], scaleAt(d));
      const torusId = ++id;
      nodeLines.push(
        nodeLine({
          id: torusId,
          parentId: parent,
          branchLevel: d + 1,
          tx: theta,
          ty: 0,
          tz: 180,
          scale: scaleForLevel(d + 1),
          rgb: DIM_RGB[(d + 1) % DIM_RGB.length],
          geometry: GEO_TOROID,
          hide: o.hideDimensions ? 1 : 0,
          topo: TOPO_TOROID,
          ratio: 0.04,
          chInputId: 0,
        }),
      );
      parent = torusId;
    }
    const leafId = ++id;
    nodeLines.push(
      nodeLine({
        id: leafId,
        parentId: parent,
        branchLevel: nDims + 1,
        tx: 0,
        ty: 0,
        tz: 0,
        scale: LEAF_SCALE,
        rgb: leafRGB(j, rows.length),
        geometry: GEO_OCTAHEDRON,
        hide: 0,
        topo: TOPO_POINT,
        ratio: 0.1,
        chInputId: 0,
      }),
    );
    if (o.tagPoints) {
      const values = row.map((v, d) => `${dataset.columnNames[d] ?? `dim${d + 1}`}=${fmt(v)}`).join(' ');
      addTag(leafId, `point ${j}: ${values}`);
    }
  }

  // Animated probe: one visible toroid chain whose per-level translate_x is
  // channel-driven, so GlyphViz channel playback replays the trajectory.
  if (o.includeChannels && nDims > 0 && rows.length > 0) {
    let parent = rootId;
    for (let d = 0; d < nDims; d++) {
      const torusId = ++id;
      nodeLines.push(
        nodeLine({
          id: torusId,
          parentId: parent,
          branchLevel: d + 1,
          tx: valueToAngle(rows[0][d], scaleAt(d)),
          ty: 0,
          tz: 180,
          scale: scaleForLevel(d + 1),
          rgb: DIM_RGB[(d + 1) % DIM_RGB.length],
          geometry: GEO_TOROID,
          hide: 0, // the probe stays visible — it is the animation
          topo: TOPO_TOROID,
          ratio: 0.04,
          chInputId: d + 1,
        }),
      );
      chMapLines.push(`${d},${d + 1},${d},translate_x,0,0,${torusId}`);
      parent = torusId;
    }
    const probeLeafId = ++id;
    nodeLines.push(
      nodeLine({
        id: probeLeafId,
        parentId: parent,
        branchLevel: nDims + 1,
        tx: 0,
        ty: 0,
        tz: 0,
        scale: LEAF_SCALE * 2, // oversize so the probe head is easy to follow
        rgb: [255, 255, 255],
        geometry: GEO_OCTAHEDRON,
        hide: 0,
        topo: TOPO_POINT,
        ratio: 0.1,
        chInputId: 0,
      }),
    );
    addTag(probeLeafId, `animated probe: channels ch0..ch${nDims - 1} drive translate_x per dimension`);

    // Channel tracks: one row per data point, one column per dimension angle.
    const header = ['cyclecount'];
    for (let d = 0; d < nDims; d++) header.push(`ch${d}`);
    trackLines.push(header.join(','));
    for (let j = 0; j < rows.length; j++) {
      const cells = [String(j)];
      for (let d = 0; d < nDims; d++) cells.push(fmt(valueToAngle(rows[j][d], scaleAt(d))));
      trackLines.push(cells.join(','));
    }
  }

  return {
    node: nodeLines.join('\n') + '\n',
    tag: tagLines.join('\n') + '\n',
    chMap: chMapLines.join('\n') + '\n',
    chTracks: trackLines.length ? trackLines.join('\n') + '\n' : '',
    rowsExported: rows.length,
    nodeCount: id,
  };
}

/** Sanitize a dataset name into a GlyphViz file-name base. */
export function fileBaseName(datasetName: string): string {
  const base = datasetName
    .replace(/\.csv$/i, '')
    .replace(/[^\w\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'hyperdims';
}
