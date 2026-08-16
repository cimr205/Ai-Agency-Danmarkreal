import { metaConfig } from './config';
import { readStore } from '../db';
import { runMetaAutomation } from './automation/runner';

export function startMetaAdsAutomation() {
  if (!metaConfig.automationEnabled) {
    return () => undefined;
  }

  const run = async () => {
    const store = readStore();
    const companyIds = [...new Set(store.metaConnections.map((row) => row.companyId))];
    for (const companyId of companyIds) {
      await runMetaAutomation(companyId);
    }
  };

  run().catch(() => undefined);
  const handle = setInterval(() => {
    run().catch(() => undefined);
  }, 1000 * 60 * 60 * 2);

  return () => clearInterval(handle);
}

