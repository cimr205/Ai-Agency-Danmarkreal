import type { Application, Request, Response } from 'express';
import { requireAuth } from '../http/middleware';
import { metaPost } from '../meta-ads-ai/meta/apiClient';
import { getMetaConnection } from '../meta-ads-ai/tenancy/metaConnectionRepository';

const tools = [
  { name: 'meta_ads_status', description: 'Get Meta Ads connection status' },
  { name: 'meta_ads_insights', description: 'Fetch Meta Ads insights' },
  { name: 'meta_ads_pause_ad', description: 'Pause an ad by id' },
  { name: 'meta_ads_pause_adset', description: 'Pause an ad set by id' },
  { name: 'meta_ads_update_budget', description: 'Update ad set daily budget' },
];

export function registerMetaAdsMcpRoutes(app: Application) {
  app.get('/api/mcp/meta-ads/tools', (_req: Request, res: Response) => {
    res.status(200).json({ tools });
  });

  app.post('/api/mcp/meta-ads/execute', async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!user.companyId) {
      res.status(400).json({ error: 'User has no company' });
      return;
    }
    const connection = getMetaConnection(user.companyId);
    if (!connection) {
      res.status(400).json({ error: 'Meta not connected' });
      return;
    }
    const { tool, args } = req.body as { tool?: string; args?: Record<string, string | number> };
    if (!tool) {
      res.status(400).json({ error: 'Missing tool' });
      return;
    }

    try {
      if (tool === 'meta_ads_pause_ad' && args?.ad_id) {
        const response = await metaPost(`${args.ad_id}`, connection.metaAccessToken, { status: 'PAUSED' });
        res.status(200).json({ result: response });
        return;
      }
      if (tool === 'meta_ads_pause_adset' && args?.adset_id) {
        const response = await metaPost(`${args.adset_id}`, connection.metaAccessToken, { status: 'PAUSED' });
        res.status(200).json({ result: response });
        return;
      }
      if (tool === 'meta_ads_update_budget' && args?.adset_id && args?.daily_budget) {
        const response = await metaPost(`${args.adset_id}`, connection.metaAccessToken, {
          daily_budget: args.daily_budget,
        });
        res.status(200).json({ result: response });
        return;
      }
      res.status(400).json({ error: 'Unsupported tool or missing args' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
}

