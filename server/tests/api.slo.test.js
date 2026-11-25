import { describe, it, expect } from 'vitest';
import { OpsReliabilityService } from '../../src/services/OpsReliabilityService';

describe('API SLO guard', () => {
  it.each([
    [120, 'healthy'],
    [250, 'healthy'],
    [499, 'healthy'],
    [500, 'healthy'],
    [501, 'degraded'],
    [650, 'degraded'],
  ])('latency p95 %dms => %s', (latencyP95, status) => {
    const snapshot = OpsReliabilityService.createHealthSnapshot({
      apiOk: true,
      queueOk: true,
      backupOk: true,
      latencyP95,
    });
    expect(snapshot.status).toBe(status);
  });
});
