/**
 * Reference haemodynamic values used to calibrate and then to validate the
 * cardiovascular model.
 *
 * These are the *independent* quantities a credibility assessment is judged
 * against. Each entry carries the range it must fall inside, the point value
 * used as a calibration target, and the provenance of that range. The
 * validation report rendered on the evidence page is generated directly from
 * this table, so the numbers shown to a reviewer and the numbers the model is
 * checked against cannot drift apart.
 *
 * Calibration and validation are deliberately not the same set: quantities
 * marked `validationOnly` are never seen by the optimiser, so agreement on
 * them is evidence rather than a tautology.
 */

export interface ReferenceValue {
  key: string;
  label: string;
  unit: string;
  target: number;
  low: number;
  high: number;
  /** Relative weight in the calibration objective (0 = validation only). */
  weight: number;
  validationOnly?: boolean;
  source: string;
}

/**
 * Reference subject: normal adult, 78 kg, 172 cm, body surface area 1.91 m^2.
 * Ranges are standard adult resting values as tabulated in cardiovascular
 * physiology and haemodynamic-monitoring references.
 */
export const NORMAL_ADULT: ReferenceValue[] = [
  {
    key: 'heartRate', label: 'Heart rate', unit: 'bpm',
    target: 70, low: 60, high: 80, weight: 2.0,
    source: 'Normal resting sinus rate, adult.',
  },
  {
    key: 'cardiacOutput', label: 'Cardiac output', unit: 'L/min',
    target: 5.4, low: 4.5, high: 6.5, weight: 4.0,
    source: 'Normal resting cardiac output, adult at rest.',
  },
  {
    key: 'cardiacIndex', label: 'Cardiac index', unit: 'L/min/m2',
    target: 2.8, low: 2.5, high: 4.0, weight: 0, validationOnly: true,
    source: 'Cardiac output indexed to body surface area; derived, not fitted.',
  },
  {
    key: 'strokeVolume', label: 'Stroke volume', unit: 'mL',
    target: 77, low: 60, high: 100, weight: 3.0,
    source: 'Normal resting stroke volume, adult.',
  },
  {
    key: 'map', label: 'Mean arterial pressure', unit: 'mmHg',
    target: 93, low: 70, high: 105, weight: 4.0,
    source: 'Normal resting mean arterial pressure.',
  },
  {
    key: 'systolic', label: 'Systolic pressure', unit: 'mmHg',
    target: 120, low: 100, high: 135, weight: 2.0,
    source: 'Normal adult systolic blood pressure.',
  },
  {
    key: 'diastolic', label: 'Diastolic pressure', unit: 'mmHg',
    target: 76, low: 60, high: 85, weight: 2.0,
    source: 'Normal adult diastolic blood pressure.',
  },
  {
    key: 'pulsePressure', label: 'Pulse pressure', unit: 'mmHg',
    target: 44, low: 30, high: 55, weight: 0, validationOnly: true,
    source: 'Systolic minus diastolic; derived, not fitted.',
  },
  {
    key: 'edv', label: 'LV end-diastolic volume', unit: 'mL',
    target: 130, low: 105, high: 160, weight: 3.0,
    source: 'Normal adult left ventricular end-diastolic volume.',
  },
  {
    key: 'esv', label: 'LV end-systolic volume', unit: 'mL',
    target: 52, low: 35, high: 70, weight: 2.0,
    source: 'Normal adult left ventricular end-systolic volume.',
  },
  {
    key: 'ejectionFraction', label: 'LV ejection fraction', unit: '%',
    target: 62, low: 55, high: 72, weight: 0, validationOnly: true,
    source: 'Derived from the fitted volumes; not itself a calibration target.',
  },
  {
    key: 'cvp', label: 'Central venous pressure', unit: 'mmHg',
    target: 5, low: 2, high: 8, weight: 3.0,
    source: 'Normal mean right atrial pressure.',
  },
  {
    key: 'pcwp', label: 'Pulmonary capillary wedge pressure', unit: 'mmHg',
    target: 9, low: 6, high: 12, weight: 3.0,
    source: 'Normal mean left atrial pressure, the physiological referent of wedge pressure.',
  },
  {
    key: 'meanPa', label: 'Mean pulmonary artery pressure', unit: 'mmHg',
    target: 15, low: 10, high: 20, weight: 2.0,
    source: 'Normal mean pulmonary artery pressure.',
  },
  {
    key: 'svr', label: 'Systemic vascular resistance', unit: 'dyn.s.cm-5',
    target: 1100, low: 800, high: 1400, weight: 2.0,
    source: 'Normal systemic vascular resistance.',
  },
  {
    key: 'pvr', label: 'Pulmonary vascular resistance', unit: 'dyn.s.cm-5',
    target: 90, low: 40, high: 160, weight: 0, validationOnly: true,
    source: 'Normal pulmonary vascular resistance; derived, not fitted.',
  },
  {
    key: 'lvedp', label: 'LV end-diastolic pressure', unit: 'mmHg',
    target: 9, low: 4, high: 14, weight: 0, validationOnly: true,
    source: 'Normal left ventricular end-diastolic pressure; derived, not fitted.',
  },
  {
    key: 'strokeWork', label: 'LV stroke work', unit: 'mmHg.mL',
    target: 8200, low: 6000, high: 11000, weight: 0, validationOnly: true,
    source: 'Pressure-volume loop area at rest; derived, not fitted.',
  },
];
