/**
 * Phone Number Utilities
 * Format and validate phone numbers for WhatsApp messaging
 */

import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';

/**
 * Format a phone number to E.164 format required by WhatsApp API
 * @param phone - The phone number to format
 * @param defaultCountry - Default country code if not specified in phone number
 * @returns E.164 formatted phone number or null if invalid
 */
export function formatToE164(phone: string, defaultCountry: CountryCode = 'IN'): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Clean the input
  const cleaned = phone.trim();
  if (!cleaned) {
    return null;
  }

  try {
    const phoneNumber = parsePhoneNumber(cleaned, defaultCountry);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
    return null;
  } catch (error) {
    console.error('[phoneUtils] Failed to parse phone number:', error);
    return null;
  }
}

/**
 * Check if a phone number is valid for WhatsApp messaging
 * @param phone - The phone number to validate
 * @param defaultCountry - Default country code if not specified
 * @returns true if the phone number is valid
 */
export function isValidForWhatsApp(phone: string, defaultCountry: CountryCode = 'IN'): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  try {
    return isValidPhoneNumber(phone.trim(), defaultCountry);
  } catch (error) {
    return false;
  }
}

/**
 * Extract country code from a phone number
 * @param phone - The phone number
 * @returns Country code (e.g., 'IN', 'US') or null
 */
export function extractCountryCode(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  try {
    const phoneNumber = parsePhoneNumber(phone.trim());
    return phoneNumber?.country || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get the default country code from environment variable
 */
export function getDefaultCountry(): CountryCode {
  const envCountry = process.env.WHATSAPP_DEFAULT_COUNTRY;
  if (envCountry && envCountry.length === 2) {
    return envCountry.toUpperCase() as CountryCode;
  }
  return 'IN';
}
