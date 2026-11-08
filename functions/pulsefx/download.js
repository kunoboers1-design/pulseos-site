import { openDownload, redirect, pulseFX } from '../../server/download-links.mjs';

export const onRequestGet = context => openDownload(pulseFX, context);
export const onRequestHead = () => redirect(pulseFX);
