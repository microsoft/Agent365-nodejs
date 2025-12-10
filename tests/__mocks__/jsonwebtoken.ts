// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Manual mock for jsonwebtoken module
 */

const jwt = {
  decode: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
};

module.exports = jwt;
