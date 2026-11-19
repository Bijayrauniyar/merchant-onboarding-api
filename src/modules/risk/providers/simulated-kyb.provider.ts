import { Injectable, Logger } from '@nestjs/common';
import { RiskResult } from '../enums/risk-result.enum';

export interface KybEvaluationResult {
  result: RiskResult;
  score: number;
  rawResponse: Record<string, any>;
}

/**
 * Deterministic simulated third-party KYB / risk evaluation provider.
 *
 * Invariants & Simulation Logic:
 * - Names containing 'FAIL' (case-insensitive) simulate upstream API timeouts
 *   or downstream vendor outages by throwing a retryable Error.
 * - Names containing 'RISKY' (case-insensitive) return FLAGGED advisory status
 *   with a low score (45) and risk factor flags.
 * - All other business names return clean PASSED status with a solid score (85).
 */
@Injectable()
export class SimulatedKybProvider {
  private readonly logger = new Logger(SimulatedKybProvider.name);

  /**
   * Evaluates a merchant business entity against compliance screening rules.
   *
   * @param businessName The trading or legal business name to evaluate.
   * @returns Simulated KYB verification result including risk score and raw response.
   * @throws Error if business name matches simulation failure trigger ('FAIL').
   */
  async evaluateBusiness(businessName: string): Promise<KybEvaluationResult> {
    const normalizedName = (businessName || '').toUpperCase();

    if (normalizedName.includes('FAIL')) {
      this.logger.warn(
        `Simulating external KYB provider timeout/outage for '${businessName}'`,
      );
      throw new Error('KYB Provider Timeout');
    }

    if (normalizedName.includes('RISKY')) {
      return {
        result: RiskResult.FLAGGED,
        score: 45,
        rawResponse: {
          provider: 'SIMULATED_KYB',
          status: 'FLAGGED',
          riskFactors: ['HIGH_RISK_CATEGORY', 'WATCHLIST_MATCH'],
          evaluatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      result: RiskResult.PASSED,
      score: 85,
      rawResponse: {
        provider: 'SIMULATED_KYB',
        status: 'PASSED',
        riskFactors: [],
        evaluatedAt: new Date().toISOString(),
      },
    };
  }
}
