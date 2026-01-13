// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { runWithExportToken } from '../context/token-context';

/**
 * Mount as early as possible so the server span is created inside this Context.
 */
export function withExportToken(getToken: (req: any) => string) {
  return function (req: any, _res: any, next: any) {
    const token = getToken(req);
    runWithExportToken(token, () => next());
  };
}
