import { downloadStats, pulseVinyl } from '../../server/download-links.mjs';

export const onRequestGet = context => downloadStats(pulseVinyl, context);
