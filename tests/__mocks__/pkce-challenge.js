// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Mock for pkce-challenge to avoid dynamic import issues in Jest
module.exports = {
  default: jest.fn(() => ({
    code_challenge: 'mock-code-challenge',
    code_verifier: 'mock-code-verifier'
  }))
};
