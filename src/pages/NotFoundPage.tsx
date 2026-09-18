import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="empty-state panel">
      <span className="eyebrow">404</span>
      <h1>That path is uncharted.</h1>
      <p>The page you requested does not exist in this character forge.</p>
      <Link className="button button--primary" to="/">Return Home</Link>
    </section>
  );
}
