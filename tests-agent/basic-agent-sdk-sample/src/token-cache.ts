// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Simple in-memory token cache with expiration handling
 * In production, use a more robust caching solution like Redis
 */
class TokenCache {
  private cache = new Map<string, string>();

  /**
   * Store a token with expiration
   */
  set(key: string, token: string): void {

    this.cache.set(key, token);

    console.log(`🔐 Token cached for key: ${key}`);
  }

  /**
   * Retrieve a token 
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      console.log(`🔍 Token cache miss for key: ${key}`);
      return null;
    }
    
    return entry;
  }

  /**
   * Check if a token exists 
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    return true;
  }
}

// Create a singleton instance for the application
const tokenCache = new TokenCache();

export default tokenCache;
