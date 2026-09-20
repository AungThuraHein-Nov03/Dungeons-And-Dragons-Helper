import { Link } from 'react-router-dom';

export function ProjectMutationUnavailable({
  title = 'Project persistence is read-only during Phase B',
  backTo,
  backLabel,
}: {
  title?: string;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <section className="empty-state panel" role="status">
      <h1>{title}</h1>
      <p>This local-development project is reading authoritative shared project data. Durable mutations remain locked until their owning persistence phase is wired.</p>
      {backTo && backLabel ? <Link className="button button--secondary" to={backTo}>{backLabel}</Link> : null}
    </section>
  );
}
