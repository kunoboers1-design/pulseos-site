import { openDownload, redirect, pulseVinyl } from '../../server/download-links.mjs';

export const onRequestGet = context => openDownload(pulseVinyl, context);
export const onRequestHead = () => redirect(pulseVinyl);
