export type PersistenceBackend = 'project' | 'browser-local';

let configuredBackend: PersistenceBackend = selectPersistenceBackend(import.meta.env.MODE);

export function selectPersistenceBackend(mode: string): PersistenceBackend {
  return mode === 'development' ? 'project' : 'browser-local';
}

export function getPersistenceBackend(): PersistenceBackend {
  return configuredBackend;
}

export function configurePersistenceBackend(backend: PersistenceBackend): void {
  configuredBackend = backend;
}

export function projectMutationsAreLocked(): boolean {
  return configuredBackend === 'project';
}

export function projectContentMutationsAreLocked(): boolean {
  return false;
}
