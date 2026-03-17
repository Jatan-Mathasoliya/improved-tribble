import { describe, expect, it } from 'vitest';
import { pickInitialPipelineStage } from '../../server/lib/pipelineStageSelection';

describe('pickInitialPipelineStage', () => {
  it('prefers the org default over global defaults', () => {
    const stages = [
      { id: 1, organizationId: null, isDefault: true },
      { id: 11, organizationId: 5, isDefault: true },
      { id: 12, organizationId: 5, isDefault: false },
    ];

    expect(pickInitialPipelineStage(stages, 5)?.id).toBe(11);
  });

  it('prefers the first org stage when the org has no explicit default', () => {
    const stages = [
      { id: 13, organizationId: 5, isDefault: false },
      { id: 3, organizationId: null, isDefault: true },
      { id: 4, organizationId: null, isDefault: true },
    ];

    expect(pickInitialPipelineStage(stages, 5)?.id).toBe(13);
  });

  it('falls back to the global default when there are no org stages', () => {
    const stages = [
      { id: 3, organizationId: null, isDefault: true },
      { id: 4, organizationId: null, isDefault: true },
    ];

    expect(pickInitialPipelineStage(stages, 5)?.id).toBe(3);
  });
});
