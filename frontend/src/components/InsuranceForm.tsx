import React from 'react';
import { InsuranceApplication, CompletionStatus } from '../types/insurance';

interface InsuranceFormProps {
  data: InsuranceApplication | null;
  completionStatus: CompletionStatus | null;
}

const InsuranceForm: React.FC<InsuranceFormProps> = ({ data, completionStatus }) => {
  if (!data) {
    return (
      <div className="insurance-form">
        <div className="form-placeholder">
          <h3>Insurance Application Form</h3>
          <p>Start a voice session to begin collecting your information.</p>
        </div>
      </div>
    );
  }

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 100) return '#4CAF50'; // Green
    if (percentage >= 75) return '#FF9800'; // Orange
    if (percentage >= 50) return '#2196F3'; // Blue
    return '#9E9E9E'; // Gray
  };

  const ProgressBar: React.FC<{ label: string; percentage: number }> = ({ label, percentage }) => (
    <div className="progress-item">
      <div className="progress-header">
        <span className="progress-label">{label}</span>
        <span className="progress-percentage">{percentage}%</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ 
            width: `${percentage}%`,
            backgroundColor: getProgressColor(percentage)
          }}
        />
      </div>
    </div>
  );

  const formatAddress = (address: any) => {
    if (!address) return 'Not provided';
    return `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`;
  };

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return 'Not specified';
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div className="insurance-form">
      <div className="form-header">
        <h3>Insurance Application Progress</h3>
        {completionStatus && (
          <div className="overall-progress">
            <ProgressBar label="Overall Completion" percentage={completionStatus.overall} />
          </div>
        )}
      </div>

      <div className="form-sections">
        {/* Personal Information Section */}
        <div className="form-section">
          <div className="section-header">
            <h4>Personal Information</h4>
            {completionStatus && (
              <ProgressBar label="" percentage={completionStatus.personalInfo} />
            )}
          </div>
          <div className="section-content">
            <div className="field-group">
              <div className="field">
                <label>Name:</label>
                <span>{data.personalInfo.firstName && data.personalInfo.lastName 
                  ? `${data.personalInfo.firstName} ${data.personalInfo.lastName}` 
                  : 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Date of Birth:</label>
                <span>{data.personalInfo.dateOfBirth || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Address:</label>
                <span>{formatAddress(data.personalInfo.address)}</span>
              </div>
              <div className="field">
                <label>Phone:</label>
                <span>{data.personalInfo.phone || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Email:</label>
                <span>{data.personalInfo.email || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Marital Status:</label>
                <span>{data.personalInfo.maritalStatus || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Occupation:</label>
                <span>{data.personalInfo.occupation || 'Not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Information Section */}
        <div className="form-section">
          <div className="section-header">
            <h4>Vehicle Information</h4>
            {completionStatus && (
              <ProgressBar label="" percentage={completionStatus.vehicleInfo} />
            )}
          </div>
          <div className="section-content">
            <div className="field-group">
              <div className="field">
                <label>Vehicle:</label>
                <span>{data.vehicleInfo.year && data.vehicleInfo.make && data.vehicleInfo.model
                  ? `${data.vehicleInfo.year} ${data.vehicleInfo.make} ${data.vehicleInfo.model}`
                  : 'Not provided'}</span>
              </div>
              <div className="field">
                <label>VIN:</label>
                <span>{data.vehicleInfo.vin || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Current Mileage:</label>
                <span>{data.vehicleInfo.currentMileage 
                  ? data.vehicleInfo.currentMileage.toLocaleString() 
                  : 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Annual Mileage:</label>
                <span>{data.vehicleInfo.annualMileage 
                  ? data.vehicleInfo.annualMileage.toLocaleString() 
                  : 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Ownership:</label>
                <span>{data.vehicleInfo.ownershipStatus || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Parking:</label>
                <span>{data.vehicleInfo.parkingLocation || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Primary Use:</label>
                <span>{data.vehicleInfo.primaryUse || 'Not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Coverage Preferences Section */}
        <div className="form-section">
          <div className="section-header">
            <h4>Coverage Preferences</h4>
            {completionStatus && (
              <ProgressBar label="" percentage={completionStatus.coveragePrefs} />
            )}
          </div>
          <div className="section-content">
            <div className="field-group">
              <div className="field">
                <label>Liability Limits:</label>
                <span>
                  {data.coveragePrefs.liabilityLimits 
                    ? `${formatCurrency(data.coveragePrefs.liabilityLimits.bodilyInjury)} / ${formatCurrency(data.coveragePrefs.liabilityLimits.propertyDamage)}`
                    : 'Not specified'}
                </span>
              </div>
              <div className="field">
                <label>Comprehensive:</label>
                <span>
                  {data.coveragePrefs.comprehensive?.selected 
                    ? `Yes (Deductible: ${formatCurrency(data.coveragePrefs.comprehensive.deductible)})`
                    : 'Not selected'}
                </span>
              </div>
              <div className="field">
                <label>Collision:</label>
                <span>
                  {data.coveragePrefs.collision?.selected 
                    ? `Yes (Deductible: ${formatCurrency(data.coveragePrefs.collision.deductible)})`
                    : 'Not selected'}
                </span>
              </div>
              <div className="field">
                <label>Additional Coverage:</label>
                <span>
                  {data.coveragePrefs.additionalCoverage 
                    ? Object.entries(data.coveragePrefs.additionalCoverage)
                        .filter(([_, selected]) => selected)
                        .map(([key, _]) => key)
                        .join(', ') || 'None selected'
                    : 'Not specified'}
                </span>
              </div>
              <div className="field">
                <label>Policy Start Date:</label>
                <span>{data.coveragePrefs.policyStartDate || 'Not specified'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Driving History Section */}
        <div className="form-section">
          <div className="section-header">
            <h4>Driving History</h4>
            {completionStatus && (
              <ProgressBar label="" percentage={completionStatus.drivingHistory} />
            )}
          </div>
          <div className="section-content">
            <div className="field-group">
              <div className="field">
                <label>License Number:</label>
                <span>{data.drivingHistory.licenseNumber || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>License State:</label>
                <span>{data.drivingHistory.licenseState || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Years Licensed:</label>
                <span>{data.drivingHistory.yearsLicensed || 'Not provided'}</span>
              </div>
              <div className="field">
                <label>Accidents:</label>
                <span>{data.drivingHistory.accidents?.length || 0} reported</span>
              </div>
              <div className="field">
                <label>Violations:</label>
                <span>{data.drivingHistory.violations?.length || 0} reported</span>
              </div>
              <div className="field">
                <label>Claims:</label>
                <span>{data.drivingHistory.claims?.length || 0} reported</span>
              </div>
              <div className="field">
                <label>Defensive Driving:</label>
                <span>{data.drivingHistory.defensiveDriving ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="form-footer">
        <div className="last-updated">
          Last updated: {new Date(data.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default InsuranceForm;
