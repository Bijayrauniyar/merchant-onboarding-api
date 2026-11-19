import { SimulatedKybProvider } from './simulated-kyb.provider';
import { RiskResult } from '../enums/risk-result.enum';

describe('SimulatedKybProvider', () => {
  let provider: SimulatedKybProvider;

  beforeEach(() => {
    provider = new SimulatedKybProvider();
  });

  it('should return PASSED with score 85 for standard clean business names', async () => {
    const result = await provider.evaluateBusiness('Acme Coffee Roasters');

    expect(result.result).toBe(RiskResult.PASSED);
    expect(result.score).toBe(85);
    expect(result.rawResponse).toEqual(
      expect.objectContaining({
        provider: 'SIMULATED_KYB',
        status: 'PASSED',
        riskFactors: [],
      }),
    );
  });

  it('should return FLAGGED with score 45 when business name contains RISKY (case-insensitive)', async () => {
    const uppercaseResult = await provider.evaluateBusiness('RISKY VENTURES LLC');
    expect(uppercaseResult.result).toBe(RiskResult.FLAGGED);
    expect(uppercaseResult.score).toBe(45);
    expect(uppercaseResult.rawResponse.status).toBe('FLAGGED');
    expect(uppercaseResult.rawResponse.riskFactors).toContain('HIGH_RISK_CATEGORY');

    const mixedCaseResult = await provider.evaluateBusiness('Somewhat Risky Shop');
    expect(mixedCaseResult.result).toBe(RiskResult.FLAGGED);
    expect(mixedCaseResult.score).toBe(45);
  });

  it('should throw Error("KYB Provider Timeout") when business name contains FAIL (case-insensitive)', async () => {
    await expect(
      provider.evaluateBusiness('FAIL ENTERPRISES CORP'),
    ).rejects.toThrow('KYB Provider Timeout');

    await expect(
      provider.evaluateBusiness('Auto fail Holdings'),
    ).rejects.toThrow('KYB Provider Timeout');
  });

  it('should safely handle empty or null-ish business names and return PASSED', async () => {
    const result = await provider.evaluateBusiness('');
    expect(result.result).toBe(RiskResult.PASSED);
    expect(result.score).toBe(85);
  });
});
