import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { projectPersistencePlugin } from './dev/projectPersistencePlugin';

export default defineConfig({
  plugins: [react(), projectPersistencePlugin()],
});
