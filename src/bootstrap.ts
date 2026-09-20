import { initializeApplicationPersistence, type PersistenceBootstrapResult } from './services/projectState';

export async function bootstrapApplication(
  renderApplication: () => void,
  options?: Parameters<typeof initializeApplicationPersistence>[0],
): Promise<PersistenceBootstrapResult> {
  const result = await initializeApplicationPersistence(options);
  if (result.ok) renderApplication();
  return result;
}
