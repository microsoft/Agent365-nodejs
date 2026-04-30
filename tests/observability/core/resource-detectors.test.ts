// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { trace } from '@opentelemetry/api';
import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';

describe('ObservabilityBuilder resource detectors', () => {
  it('should not include host.name or host.arch in exported spans', async () => {
    // Force ObservabilityBuilder to take the NodeSDK code path
    jest.spyOn(trace, 'getTracerProvider').mockReturnValue({} as any);

    const builder = new ObservabilityBuilder()
      .withService('resource-detector-test', '1.0.0');

    builder.build();
    builder.start();

    // Restore spy so we can read the real provider set by NodeSDK
    jest.restoreAllMocks();

    // Give async resource detectors time to resolve
    await new Promise(resolve => setTimeout(resolve, 1000));

    // The NodeSDK sets a ProxyTracerProvider as global.
    const globalProvider = trace.getTracerProvider() as any;

    // Walk the internal chain to find the resource
    let resource: any;
    const candidates = [
      globalProvider?.resource,
      globalProvider?.getDelegate?.()?.resource,
      globalProvider?._delegate?.resource,
      globalProvider?._delegate?.getDelegate?.()?.resource,
    ];

    for (const candidate of candidates) {
      if (candidate?.attributes) {
        resource = candidate;
        break;
      }
    }

    // Fallback: access from the builder's internal sdk field
    if (!resource) {
      const sdk = (builder as any).sdk;
      if (sdk) {
        const internalCandidates = [
          sdk?._tracerProvider?.resource,
          sdk?._resource,
          sdk?.resource,
        ];
        for (const candidate of internalCandidates) {
          if (candidate?.attributes) {
            resource = candidate;
            break;
          }
        }
      }
    }

    expect(resource).toBeDefined();
    expect(resource.attributes).toBeDefined();

    // host.name and host.arch should NOT be present (hostDetector excluded)
    expect(resource.attributes['host.name']).toBeUndefined();
    expect(resource.attributes['host.arch']).toBeUndefined();

    // service.instance.id should NOT be present (serviceInstanceIdDetector excluded)
    expect(resource.attributes['service.instance.id']).toBeUndefined();

    // process.pid SHOULD be present (processDetector kept)
    expect(resource.attributes['process.pid']).toBeDefined();
    expect(resource.attributes['process.pid']).toBe(process.pid);

    // service.name SHOULD be present (explicitly set)
    expect(resource.attributes['service.name']).toContain('resource-detector-test');

    // Clean up
    await builder.shutdown();
  });
});
