import {
  MerchantApplication,
  numericColumnTransformer,
} from './merchant-application.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { RiskStatus } from '../enums/risk-status.enum';
import { BusinessType } from '../enums/business-type.enum';

describe('MerchantApplication Entity', () => {
  it('should instantiate entity with appropriate property values', () => {
    const app = new MerchantApplication();
    app.id = '123e4567-e89b-12d3-a456-426614174000';
    app.businessName = 'Acme Corp';
    app.legalBusinessName = 'Acme Corporation LLC';
    app.businessType = BusinessType.LLC;
    app.ownerName = 'Jane Doe';
    app.ownerEmail = 'jane@acme.com';
    app.ownerPhone = '+14155552671';
    app.requestedMonthlyVolume = 50000.0;
    app.requestedAvgTicket = 150.0;
    app.status = ApplicationStatus.DRAFT;
    app.riskStatus = RiskStatus.NOT_STARTED;
    app.submissionVersion = 0;
    app.createdById = '123e4567-e89b-12d3-a456-426614174001';
    app.assignedReviewerId = null;
    app.decisionNote = null;
    app.decidedAt = null;

    expect(app.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(app.businessName).toBe('Acme Corp');
    expect(app.businessType).toBe(BusinessType.LLC);
    expect(app.status).toBe(ApplicationStatus.DRAFT);
    expect(app.riskStatus).toBe(RiskStatus.NOT_STARTED);
    expect(app.submissionVersion).toBe(0);
    expect(app.requestedMonthlyVolume).toBe(50000.0);
    expect(app.requestedAvgTicket).toBe(150.0);
  });

  describe('numericColumnTransformer', () => {
    it('should transform numeric string from database into JavaScript number', () => {
      expect(numericColumnTransformer.from('50000.50')).toBe(50000.5);
      expect(numericColumnTransformer.from('120.00')).toBe(120);
      expect(numericColumnTransformer.from('0')).toBe(0);
    });

    it('should handle null and undefined when hydrating from database', () => {
      expect(numericColumnTransformer.from(null)).toBeNull();
      expect(numericColumnTransformer.from(undefined)).toBeNull();
    });

    it('should transform JavaScript number to database numeric representation', () => {
      expect(numericColumnTransformer.to(50000.5)).toBe(50000.5);
      expect(numericColumnTransformer.to(0)).toBe(0);
    });

    it('should handle null and undefined when serializing to database', () => {
      expect(numericColumnTransformer.to(null)).toBeNull();
      expect(numericColumnTransformer.to(undefined)).toBeNull();
    });
  });

  describe('Enums completeness', () => {
    it('should have all expected ApplicationStatus values', () => {
      expect(ApplicationStatus.DRAFT).toBe('DRAFT');
      expect(ApplicationStatus.SUBMITTED).toBe('SUBMITTED');
      expect(ApplicationStatus.INFO_REQUESTED).toBe('INFO_REQUESTED');
      expect(ApplicationStatus.APPROVED).toBe('APPROVED');
      expect(ApplicationStatus.REJECTED).toBe('REJECTED');
    });

    it('should have all expected RiskStatus values', () => {
      expect(RiskStatus.NOT_STARTED).toBe('NOT_STARTED');
      expect(RiskStatus.PENDING).toBe('PENDING');
      expect(RiskStatus.PASSED).toBe('PASSED');
      expect(RiskStatus.FLAGGED).toBe('FLAGGED');
      expect(RiskStatus.FAILED).toBe('FAILED');
    });

    it('should have all expected BusinessType values', () => {
      expect(BusinessType.INDIVIDUAL).toBe('INDIVIDUAL');
      expect(BusinessType.SOLE_PROPRIETORSHIP).toBe('SOLE_PROPRIETORSHIP');
      expect(BusinessType.LLC).toBe('LLC');
      expect(BusinessType.CORPORATION).toBe('CORPORATION');
      expect(BusinessType.PARTNERSHIP).toBe('PARTNERSHIP');
    });
  });
});
