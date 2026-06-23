import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  closestBrandKits,
  extractBrandMentions,
  hasExplicitOverwrite,
  listBrandKits,
  loadBrandKit,
  normalizeReferenceImages,
  parseCarouselCopy,
  saveArchetype,
  selectArchetypes,
  upgradeFlatKitForEdit,
  type ArchetypeRecord,
} from '../src/tools/brand-kit-remix-core';

function tmpBrandKitDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'figmento-bkr-'));
}

function writeYaml(file: string, data: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump(data), 'utf-8');
}

describe('brand-kit remix core', () => {
  test('enumerates flat and folder brand kits and prefers folder duplicates', () => {
    const dir = tmpBrandKitDir();
    writeYaml(path.join(dir, 'carmelus.yaml'), { brand_id: 'carmelus', brand_name: 'Carmelus Flat' });
    writeYaml(path.join(dir, 'carmelus', 'kit.yaml'), { brand_id: 'carmelus', brand_name: 'Carmelus Folder', remix: { carousel: {} } });
    writeYaml(path.join(dir, 'momment.yaml'), { brand_id: 'momment', brand_name: 'Momment' });

    const kits = listBrandKits(dir);
    expect(kits.map(k => k.id).sort()).toEqual(['carmelus', 'momment']);
    expect(kits.find(k => k.id === 'carmelus')?.storage).toBe('folder');
    expect(kits.find(k => k.id === 'carmelus')?.hasRemix).toBe(true);
  });

  test('loadBrandKit reads legacy flat kits without upgrading', () => {
    const dir = tmpBrandKitDir();
    const flat = path.join(dir, 'agrosempre.yaml');
    writeYaml(flat, { brand_id: 'agrosempre', brand_name: 'Agro Sempre' });

    const loaded = loadBrandKit('agrosempre', dir);
    expect(loaded.storage).toBe('flat');
    expect(fs.existsSync(flat)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'agrosempre', 'kit.yaml'))).toBe(false);
  });

  test('upgradeFlatKitForEdit writes folder kit then removes flat kit', () => {
    const dir = tmpBrandKitDir();
    const flat = path.join(dir, 'carmelus.yaml');
    writeYaml(flat, { brand_id: 'carmelus', brand_name: 'Carmelus' });

    const upgraded = upgradeFlatKitForEdit('carmelus', dir);
    expect(upgraded).toBe(path.join(dir, 'carmelus', 'kit.yaml'));
    expect(fs.existsSync(upgraded)).toBe(true);
    expect(fs.existsSync(flat)).toBe(false);
  });

  test('upgradeFlatKitForEdit fails loudly on folder collision', () => {
    const dir = tmpBrandKitDir();
    writeYaml(path.join(dir, 'carmelus.yaml'), { brand_id: 'carmelus' });
    fs.mkdirSync(path.join(dir, 'carmelus'), { recursive: true });

    expect(() => upgradeFlatKitForEdit('carmelus', dir)).toThrow(/folder already exists/);
  });

  test('mention parser ignores emails and code fences', () => {
    const text = 'Use @Carmelus, not caio@example.com\n```md\n@Hidden\n```\nAlso @momment.';
    expect(extractBrandMentions(text)).toEqual(['Carmelus', 'momment']);
  });

  test('overwrite detection supports explicit EN and PT-BR keywords', () => {
    expect(hasExplicitOverwrite('please replace selected frames')).toBe(true);
    expect(hasExplicitOverwrite('pode sobrescrever esse carrossel')).toBe(true);
    expect(hasExplicitOverwrite('create a new carousel')).toBe(false);
  });

  test('copy parser handles separators labels and first-line title heuristic', () => {
    const slides = parseCarouselCopy([
      'Short title',
      'Unlabeled body copy for slide one.',
      'Image: blue ink saint illustration',
      '---',
      'Título: Segundo slide',
      'Texto: Corpo em português.',
      'Imagem: lírios em aquarela',
    ].join('\n'));

    expect(slides).toEqual([
      { title: 'Short title', body: 'Unlabeled body copy for slide one.', imagePrompt: 'blue ink saint illustration' },
      { title: 'Segundo slide', body: 'Corpo em português.', imagePrompt: 'lírios em aquarela' },
    ]);
  });

  test('archetype selection is deterministic by role and order', () => {
    const archetypes: ArchetypeRecord[] = [
      { id: 'body-a', role: 'body', order: 2, enabled: true, presetVersion: '2.5c', nodes: [{}] },
      { id: 'body-b', role: 'body', order: 1, enabled: true, presetVersion: '2.5c', nodes: [{}] },
      { id: 'cover', role: 'cover', order: 1, enabled: true, presetVersion: '2.5c', nodes: [{}] },
      { id: 'image', role: 'image_body', order: 1, enabled: true, presetVersion: '2.5c', nodes: [{}] },
      { id: 'cta', role: 'cta', order: 1, enabled: true, presetVersion: '2.5c', nodes: [{}] },
    ];
    const selected = selectArchetypes([
      { title: 'One' },
      { body: 'Two' },
      { body: 'Three', imagePrompt: 'image' },
      { body: 'Four' },
    ], archetypes);

    expect(selected.map(s => s.archetype.id)).toEqual(['cover', 'body-b', 'image', 'cta']);
  });

  test('reference images are capped to 3', () => {
    expect(normalizeReferenceImages(['a.png', 'b.png', 'c.png', 'd.png'])).toEqual(['a.png', 'b.png', 'c.png']);
  });

  test('closest brand kit suggestions are stable', () => {
    const kits = [
      { id: 'carmelus', name: 'Carmelus', path: '', storage: 'flat' as const, hasRemix: false },
      { id: 'momment', name: 'Momment', path: '', storage: 'flat' as const, hasRemix: false },
    ];
    expect(closestBrandKits('carmelo', kits, 1)).toEqual(['Carmelus']);
  });

  test('saveArchetype stamps preset version', () => {
    const dir = tmpBrandKitDir();
    const saved = saveArchetype({
      brandId: 'carmelus',
      dir,
      archetype: { id: 'cover-main', role: 'cover', order: 1, enabled: true, nodes: [{ type: 'FRAME' }] },
    });
    const parsed = JSON.parse(fs.readFileSync(saved, 'utf-8'));
    expect(parsed.presetVersion).toBe('2.5c');
  });
});
