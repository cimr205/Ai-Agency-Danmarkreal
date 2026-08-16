import { Deal, DealRepository, DealStageId } from '../../domain/deals';

export interface PipelineStageSummary {
  stageId: DealStageId;
  count: number;
  totalValue: number;
  avgDaysInStage: number;
}

export class PipelineService {
  constructor(private readonly deals: DealRepository) {}

  async getStageSummary(stageId: DealStageId): Promise<PipelineStageSummary> {
    const deals = await this.deals.findByStage(stageId);
    const now = Date.now();
    const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);
    const avgDaysInStage = deals.length
      ? Math.round(
          deals.reduce((sum, deal) => sum + this.daysInStage(deal, now), 0) / deals.length
        )
      : 0;

    return {
      stageId,
      count: deals.length,
      totalValue,
      avgDaysInStage,
    };
  }

  private daysInStage(deal: Deal, now: number) {
    const entered = new Date(deal.stageEnteredAt).getTime();
    return Math.max(0, Math.floor((now - entered) / (1000 * 60 * 60 * 24)));
  }
}

