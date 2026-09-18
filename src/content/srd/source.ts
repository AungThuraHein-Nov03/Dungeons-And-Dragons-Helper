import type { SrdSourceMetadata } from '../../models/content';

export const SRD_5_2_1_SOURCE = {
  type: 'srd',
  ruleset: '5.2.1',
  documentTitle: 'System Reference Document 5.2.1',
  license: 'CC-BY-4.0',
  published: '2025-05-01',
  url: 'https://www.dndbeyond.com/srd',
} as const satisfies SrdSourceMetadata;

export const SRD_ID_PREFIX = 'srd-5.2.1:';

export function srdId(kind: string, slug: string): string {
  return `${SRD_ID_PREFIX}${kind}:${slug}`;
}
