import { describe, it, expect } from 'vitest';
import { CreateTopicSchema, UpdateTopicSchema } from '../topic';

describe('CreateTopicSchema — Phase 5 white-label fields', () => {
  const base = { slug: 'fintech-weekly', name: 'FinTech Weekly' };

  it('accepts an https brand logo URL', () => {
    const parsed = CreateTopicSchema.parse({
      ...base,
      brandLogoUrl: 'https://cdn.example.com/logo.png',
    });
    expect(parsed.brandLogoUrl).toBe('https://cdn.example.com/logo.png');
  });

  it('rejects non-https logo URLs (javascript:/data:/http:)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
      'http://cdn.example.com/logo.png',
      'ftp://example.com/logo.png',
    ]) {
      expect(() => CreateTopicSchema.parse({ ...base, brandLogoUrl: bad })).toThrow();
    }
  });

  it('accepts a valid #RRGGBB accent and rejects malformed hex', () => {
    expect(CreateTopicSchema.parse({ ...base, brandColorHex: '#E6007E' }).brandColorHex).toBe(
      '#E6007E',
    );
    expect(() => CreateTopicSchema.parse({ ...base, brandColorHex: 'red' })).toThrow();
  });

  it('defaults language to tr and accepts en', () => {
    expect(CreateTopicSchema.parse(base).language).toBe('tr');
    expect(CreateTopicSchema.parse({ ...base, language: 'en' }).language).toBe('en');
    expect(() => CreateTopicSchema.parse({ ...base, language: 'de' })).toThrow();
  });
});

describe('UpdateTopicSchema — Phase 5 white-label fields', () => {
  it('rejects a non-https logo URL on update too', () => {
    expect(() => UpdateTopicSchema.parse({ brandLogoUrl: 'http://x.com/l.png' })).toThrow();
    expect(UpdateTopicSchema.parse({ brandLogoUrl: 'https://x.com/l.png' }).brandLogoUrl).toBe(
      'https://x.com/l.png',
    );
  });
});
