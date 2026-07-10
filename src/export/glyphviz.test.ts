import { describe, it, expect } from 'vitest';
import {
  buildGlyphVizFiles,
  fileBaseName,
  leafRGB,
  NODE_HEADER,
  TAG_HEADER,
  CHMAP_HEADER,
} from './glyphviz';
import type { Dataset } from '../data/demos';
import type { HCSConfig } from '../hcs/geometry';

const cfg: HCSConfig = { baseRadius: 100, radiusRatio: 0.4, scales: [1, 1, 1] };

function dataset(rows: number[][], names?: string[]): Dataset {
  return { rows, columnNames: names ?? rows[0]?.map((_, i) => `d${i + 1}`) ?? [] };
}

function parse(csv: string): string[][] {
  return csv
    .trim()
    .split('\n')
    .map((line) => line.split(','));
}

describe('buildGlyphVizFiles', () => {
  it('writes the GlyphViz node and tag headers exactly', () => {
    const f = buildGlyphVizFiles(dataset([[1, 2]]), cfg, 'test');
    expect(f.node.split('\n')[0]).toBe(NODE_HEADER);
    expect(f.tag.split('\n')[0]).toBe(TAG_HEADER);
    expect(f.chMap.split('\n')[0]).toBe(CHMAP_HEADER);
    // 23 columns in every node row.
    for (const row of parse(f.node)) expect(row.length).toBe(23);
  });

  it('creates root + (dims toroids + leaf) per row, plus the probe chain', () => {
    const rows = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const f = buildGlyphVizFiles(dataset(rows), cfg, 'test');
    // 1 root + 2 rows × (3 toroids + 1 leaf) + probe (3 toroids + 1 leaf)
    expect(f.nodeCount).toBe(1 + 2 * 4 + 4);
    expect(f.rowsExported).toBe(2);
    const lines = parse(f.node).slice(1);
    expect(lines.length).toBe(f.nodeCount);
  });

  it('encodes values as HCS angles in translate_x with correct hierarchy', () => {
    // v=1 at scale 1 → 90°; v=3 → 135°; v=-1 → -90°.
    const f = buildGlyphVizFiles(dataset([[1, 3, -1]]), cfg, 'test', { includeChannels: false });
    const lines = parse(f.node).slice(1);
    const [root, t1, t2, t3, leaf] = lines;
    const col = (row: string[], name: string): string => row[NODE_HEADER.split(',').indexOf(name)];

    expect(col(root, 'parent_id')).toBe('0');
    expect(col(root, 'topo')).toBe('3'); // toroid
    expect(col(root, 'geometry')).toBe('7');

    expect(col(t1, 'parent_id')).toBe(col(root, 'id'));
    expect(col(t1, 'translate_x')).toBe('90');
    expect(col(t1, 'branch_level')).toBe('1');
    expect(col(t2, 'parent_id')).toBe(col(t1, 'id'));
    expect(col(t2, 'translate_x')).toBe('135');
    expect(col(t3, 'translate_x')).toBe('-90');

    expect(col(leaf, 'parent_id')).toBe(col(t3, 'id'));
    expect(col(leaf, 'geometry')).toBe('11'); // octahedron
    expect(col(leaf, 'topo')).toBe('7'); // point
    expect(col(leaf, 'hide')).toBe('0');
  });

  it('maps ±Infinity to ±180°', () => {
    const f = buildGlyphVizFiles(dataset([[Infinity, -Infinity]]), cfg, 'test', { includeChannels: false });
    const lines = parse(f.node).slice(1);
    const txIdx = NODE_HEADER.split(',').indexOf('translate_x');
    expect(lines[1][txIdx]).toBe('180');
    expect(lines[2][txIdx]).toBe('-180');
  });

  it('respects per-dimension scales like the on-screen plot', () => {
    const scaled: HCSConfig = { ...cfg, scales: [50, 1] };
    const f = buildGlyphVizFiles(dataset([[50, 1]]), scaled, 'test', { includeChannels: false });
    const lines = parse(f.node).slice(1);
    const txIdx = NODE_HEADER.split(',').indexOf('translate_x');
    expect(lines[1][txIdx]).toBe('90'); // 50 at scale 50 → 90°
  });

  it('hides dimension toroids by default but not when disabled', () => {
    const hideIdx = NODE_HEADER.split(',').indexOf('hide');
    const hidden = buildGlyphVizFiles(dataset([[1, 2]]), cfg, 'test', { includeChannels: false });
    expect(parse(hidden.node)[2][hideIdx]).toBe('1');
    const shown = buildGlyphVizFiles(dataset([[1, 2]]), cfg, 'test', {
      includeChannels: false,
      hideDimensions: false,
    });
    expect(parse(shown.node)[2][hideIdx]).toBe('0');
  });

  it('skips rows containing NaN and honors maxRows', () => {
    const f = buildGlyphVizFiles(dataset([[1, 2], [NaN, 2], [3, 4], [5, 6]]), cfg, 'test', {
      maxRows: 2,
      includeChannels: false,
    });
    expect(f.rowsExported).toBe(2);
  });

  it('writes channel map + tracks that replay the trajectory angles', () => {
    const rows = [
      [1, 3],
      [0, -1],
    ];
    const f = buildGlyphVizFiles(dataset(rows), cfg, 'test');
    const map = parse(f.chMap).slice(1);
    expect(map.length).toBe(2); // one channel per dimension
    expect(map[0][3]).toBe('translate_x');
    expect(map[0][1]).toBe('1'); // channel_id 1 → track 0
    expect(map[0][2]).toBe('0');

    const tracks = parse(f.chTracks);
    expect(tracks[0]).toEqual(['cyclecount', 'ch0', 'ch1']);
    expect(tracks[1]).toEqual(['0', '90', '135']);
    expect(tracks[2]).toEqual(['1', '0', '-90']);

    // Probe toroids carry matching ch_input_id and stay visible.
    const chIdx = NODE_HEADER.split(',').indexOf('ch_input_id');
    const hideIdx = NODE_HEADER.split(',').indexOf('hide');
    const nodeRows = parse(f.node).slice(1);
    const probeToroids = nodeRows.filter((r) => r[chIdx] !== '0');
    expect(probeToroids.length).toBe(2);
    expect(probeToroids.map((r) => r[chIdx])).toEqual(['1', '2']);
    expect(probeToroids.every((r) => r[hideIdx] === '0')).toBe(true);
  });

  it('omits channel data when includeChannels is false', () => {
    const f = buildGlyphVizFiles(dataset([[1, 2]]), cfg, 'test', { includeChannels: false });
    expect(f.chTracks).toBe('');
    expect(parse(f.chMap).length).toBe(1); // header only
  });

  it('writes a root tag always and point tags when enabled', () => {
    const withTags = buildGlyphVizFiles(dataset([[1]]), cfg, 'mydata', { includeChannels: false });
    const tagRows = withTags.tag.trim().split('\n').slice(1);
    expect(tagRows.length).toBe(2);
    expect(tagRows[0]).toContain('mydata');
    expect(tagRows[1]).toContain('point 0');

    const noTags = buildGlyphVizFiles(dataset([[1]]), cfg, 'mydata', {
      includeChannels: false,
      tagPoints: false,
    });
    expect(noTags.tag.trim().split('\n').slice(1).length).toBe(1);
  });
});

describe('leafRGB', () => {
  it('starts red and ends purple (rainbow time ramp)', () => {
    const [r0, g0, b0] = leafRGB(0, 100);
    expect(r0).toBeGreaterThan(200);
    expect(g0).toBeLessThan(60);
    expect(b0).toBeLessThan(60);
    const [r1, , b1] = leafRGB(99, 100);
    expect(r1).toBeGreaterThan(150);
    expect(b1).toBeGreaterThan(150);
  });
});

describe('fileBaseName', () => {
  it('sanitizes names', () => {
    expect(fileBaseName('My Data (v2).csv')).toBe('My_Data_v2');
    expect(fileBaseName('Tangent (through ±∞)')).toBe('Tangent_through');
    expect(fileBaseName('???')).toBe('hyperdims');
  });
});
