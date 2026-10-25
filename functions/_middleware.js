import { friendsAccess } from '../server/pulsefx-access/gate.mjs';

// MARK: - Centrale toegangscontrole vóór statische webapp en API-routes
export const onRequest = context => friendsAccess(context);
