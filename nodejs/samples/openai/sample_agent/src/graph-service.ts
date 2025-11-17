// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TokenHelper } from './token-helper';

/**
 * GraphService provides integration with Microsoft Graph API.
 * This service demonstrates how to interact with Microsoft 365 data
 * using the agent's authentication context.
 */
export class GraphService {
  private tokenHelper: TokenHelper;
  private graphEndpoint = 'https://graph.microsoft.com/v1.0';

  constructor(tokenHelper: TokenHelper) {
    this.tokenHelper = tokenHelper;
  }

  /**
   * Gets the current user's profile information.
   * @returns User profile data or null if not available
   */
  async getCurrentUser(): Promise<any | null> {
    try {
      const token = await this.tokenHelper.getAccessToken();
      if (!token) {
        console.warn('Unable to get access token for Graph API');
        return null;
      }

      const response = await fetch(`${this.graphEndpoint}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
      }

      const user = await response.json();
      return user;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Sends an email using Microsoft Graph API.
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param body - Email body content
   * @returns true if email was sent successfully, false otherwise
   */
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    try {
      const token = await this.tokenHelper.getAccessToken();
      if (!token) {
        console.warn('Unable to get access token for Graph API');
        return false;
      }

      const message = {
        message: {
          subject: subject,
          body: {
            contentType: 'Text',
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
      };

      const response = await fetch(`${this.graphEndpoint}/me/sendMail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
      }

      console.log(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Gets the user's recent emails.
   * @param count - Number of emails to retrieve (default: 10)
   * @returns Array of email messages or null if not available
   */
  async getRecentEmails(count: number = 10): Promise<any[] | null> {
    try {
      const token = await this.tokenHelper.getAccessToken();
      if (!token) {
        console.warn('Unable to get access token for Graph API');
        return null;
      }

      const response = await fetch(`${this.graphEndpoint}/me/messages?$top=${count}&$select=subject,from,receivedDateTime`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('Failed to get recent emails:', error);
      return null;
    }
  }
}
