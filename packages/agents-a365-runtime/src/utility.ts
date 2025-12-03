// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from '@microsoft/agents-hosting';
import * as jwt from 'jsonwebtoken';
import { type } from 'os';
import pkginfo from 'pkginfo';

/**
 * Utility class providing helper methods for agent runtime operations.
 */
export class Utility {
  /**
   * Decodes the current token and retrieves the App ID (appid or azp claim).
   * @param token Token to Decode
   * @returns AppId
   */
  public static GetAppIdFromToken(token: string): string {
    if (!token || token.trim() === '') {
      return '00000000-0000-0000-0000-000000000000';
    }

    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      if (!decoded) {
        return '';
      }

      // Look for appid claim first, then azp claim as fallback
      const appIdClaim = decoded['appid'] || decoded['azp'];
      return appIdClaim || '';
    } catch (_error) {
      // Silent error handling - return empty string on decode failure
      return '';
    }
  }

  /**
   * Resolves the agent identity from the turn context or auth token.
   * @param context Turn Context of the turn.
   * @param authToken Auth token if available.
   * @returns Agent identity (App ID)
   */
  public static ResolveAgentIdentity(context: TurnContext, authToken: string): string {
    // App ID is required to pass to MCP server URL.
    const agenticAppId = context.activity.isAgenticRequest()
      ? context.activity.getAgenticInstanceId() || ''
      : this.GetAppIdFromToken(authToken);

    return agenticAppId;
  }

  /**
   * Generates a User-Agent header string containing SDK version, OS type, Node.js version, and orchestrator.
   * @param orchestrator Optional orchestrator identifier to include in the User-Agent string.
   * @returns Formatted User-Agent header string.
   */
  public static GetUserAgentHeader(orchestrator: string = ""): string {
    pkginfo(module, 'version');
    const version = module.exports.version || 'unknown';
    const orchestratorPart = orchestrator ? `; ${orchestrator}` : '';
    return `Agent365SDK/${version} (${this.ResolveOsType()}; Node.js/${process.version}${orchestratorPart})`;
  }

  private static ResolveOsType(): string {
    const osType = type();
    switch (osType) {
      case 'Windows_NT':
        return 'Windows';
      case 'Darwin':
        return 'macOS';
      case 'Linux':
        return 'Linux';
      default:
        return osType;
    }
  }
}