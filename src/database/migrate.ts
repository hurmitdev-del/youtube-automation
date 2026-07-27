import { getDatabase } from './connection.js';
import { logger } from '../utils/logger.js';

/**
 * Standalone entry point: `npm run migrate`.
 * Simply opening the database triggers schema creation, but this script
 * exists so operators have an explicit, discoverable migration step.
 */
function main(): void {
  getDatabase();
  logger.info('Migration complete. Database schema is up to date.');
}

main();
