import { describe, expect, it } from 'vitest';
import { fitWithin } from './image.js';

describe('fitWithin', () => {
  it('scales a large portrait photo so the long side is 1600', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it('never scales up', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
