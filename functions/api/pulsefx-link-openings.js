import { downloadStats, pulseFX } from '../../server/download-links.mjs';

export const onRequestGet = context => downloadStats(pulseFX, context);
