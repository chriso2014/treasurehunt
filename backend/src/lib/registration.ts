import type { RouteName } from '@treasurehunt/shared';

/** Routes alternate in registration order: 1st team A, 2nd B, 3rd A... */
export const routeForRegistration = (count: number): RouteName => (count % 2 === 1 ? 'A' : 'B');
