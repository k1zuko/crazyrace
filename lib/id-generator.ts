/**
 * Generate XID - globally unique, URL-safe, sortable identifier
 * Format: 12-byte value consisting of:
 * - 4-byte timestamp (big endian, seconds since Unix epoch)
 * - 3-byte machine id
 * - 2-byte process id
 * - 3-byte random counter
 *
 * @returns {string} XID string (20 characters, base32 encoded)
 * @example "c9iqk5m6ed4lbcr11bfg"
 */
export function generateXID(): string {
  // Use require() for better compatibility with xid-js
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XID = require("xid-js");
  return XID.next();
}

/**
 * Generate ID using XID format
 * Alias for generateXID for consistency
 */
export const generateId = generateXID;

/**
 * For backward compatibility with existing UUID code
 * @deprecated Use generateXID() instead
 */
export const generateUUID = generateXID;

/**
 * Generate XID with prefix for specific entity types
 * @param prefix - Entity prefix (e.g., 'user', 'quiz', 'session')
 * @returns {string} Prefixed XID (e.g., 'user_c9iqk5m6ed4lbcr11bfg')
 */
export function generatePrefixedXID(prefix: string): string {
  return `${prefix}_${generateXID()}`;
}

/**
 * Validate if string is a valid XID format
 * @param id - String to validate
 * @returns {boolean} True if valid XID format
 */
export function isValidXID(id: string): boolean {
  if (!id || typeof id !== "string") return false;

  // XID is 20 characters long, base32 encoded (0-9, a-z)
  // Based on Crockford's Base32: 0-9 and a-z (excluding i, l, o, u to avoid confusion)
  const xidRegex = /^[0-9a-hjkmnp-tv-z]{20}$/;
  return xidRegex.test(id);
}

/**
 * Extract timestamp from XID
 * @param xid - XID string
 * @returns {Date | null} Date object or null if invalid
 */
export function getXIDTimestamp(xid: string): Date | null {
  if (!isValidXID(xid)) return null;

  try {
    // Use require() for better compatibility with xid-js
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XID = require("xid-js");

    // XID library should have a method to extract timestamp
    // Check if the library provides timestamp extraction
    if (XID.fromString && typeof XID.fromString === "function") {
      const xidObj = XID.fromString(xid);
      return xidObj.timestamp ? new Date(xidObj.timestamp * 1000) : null;
    }

    // Fallback: manual extraction from first 4 bytes (timestamp in seconds)
    // XID uses base32 encoding, so we need to decode first
    // For now, return null - implement if timestamp extraction is needed
    return null;
  } catch {
    return null;
  }
}
