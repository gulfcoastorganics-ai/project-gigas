export const VERIFICATION_STATES = ['placeholder', 'draft', 'machine-assisted', 'internally-reviewed', 'externally-reviewed', 'verified', 'disputed', 'deprecated']
export const VERIFICATION_LABELS = { placeholder: 'Placeholder', draft: 'Draft', 'machine-assisted': 'Machine-assisted', 'internally-reviewed': 'Internally reviewed', 'externally-reviewed': 'Externally reviewed', verified: 'Verified', disputed: 'Disputed', deprecated: 'Deprecated' }
export function isVerificationState(value) { return VERIFICATION_STATES.includes(value) }
export function currentVerification(history = [], fallback = 'placeholder') { return history.at(-1)?.state || fallback }
