import type { ContentSourceMetadata } from '../models/content';
import { formatSource } from '../utils/contentFormat';

export function SourceBadge({ source }: { source: ContentSourceMetadata }) {
  return <span className={`source-badge source-badge--${source.type}`}>{formatSource(source)}</span>;
}
