/**
 * Phone Normalization Utility
 * Handles US phone number validation and normalization to E.164 format
 */

export interface PhoneValidationResult {
  success: boolean;
  formattedPhone?: string;
  error?: string;
}

/**
 * Normalize and validate phone number to E.164 format
 * Accepts formats: (914) 837-3750, 9148373750, +19148373750
 * Returns: +19148373750 (E.164 format)
 */
export function normalizePhoneNumber(phoneNumber: string): PhoneValidationResult {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return {
      success: false,
      error: 'Phone number is required'
    };
  }

  // Remove all non-digit characters
  const digitsOnly = phoneNumber.trim().replace(/\D/g, '');

  // Check if we have any digits at all
  if (!digitsOnly || digitsOnly.length === 0) {
    return {
      success: false,
      error: 'Phone number must contain at least one digit'
    };
  }

  // Validate length (10-15 digits for international numbers, 10-11 for US)
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return {
      success: false,
      error: `Invalid phone number length: ${digitsOnly.length} digits (expected 10-15)`
    };
  }

  let formattedPhone: string;

  // Handle US phone numbers (10 or 11 digits)
  if (digitsOnly.length === 10) {
    // 10 digits: US number without country code
    // Example: 9148373750 → +19148373750
    formattedPhone = `+1${digitsOnly}`;
  } else if (digitsOnly.length === 11) {
    // 11 digits: could be +1XXXXXXXXXX or duplicate 1
    if (digitsOnly.startsWith('11')) {
      // Duplicate country code: 11555... → remove second 1 → 1555...
      const correctedDigits = '1' + digitsOnly.substring(2);
      formattedPhone = `+${correctedDigits}`;
    } else if (digitsOnly.startsWith('1')) {
      // Normal US number with country code: 1555... → +1555...
      formattedPhone = `+${digitsOnly}`;
    } else {
      // Invalid 11-digit number
      return {
        success: false,
        error: '11-digit numbers must start with 1 (US country code)'
      };
    }
  } else {
    // 12-15 digits: international numbers
    // Just prepend + if not already there
    formattedPhone = `+${digitsOnly}`;
  }

  // Final validation: ensure it starts with + and has valid format
  if (!formattedPhone.startsWith('+')) {
    return {
      success: false,
      error: 'Invalid phone format after normalization'
    };
  }

  return {
    success: true,
    formattedPhone
  };
}

/**
 * Validate and normalize phone number (throws error if invalid)
 * Use this when you want to fail fast on invalid input
 */
export function validateAndNormalizePhone(phoneNumber: string): string {
  const result = normalizePhoneNumber(phoneNumber);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.formattedPhone!;
}
