import { describe, expect, it } from 'vitest';

import { BOOTSTRAP_READY } from './app.js';

describe('web bootstrap', () => {
  it('marks the scaffold as ready for the first vertical slice', () => {
    expect(BOOTSTRAP_READY).toBe(true);
  });
});
