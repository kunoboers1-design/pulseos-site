const appStoreURL = 'https://apps.apple.com/app/apple-store/id6751821638?pt=128059620&ct=Instagram&mt=8';

export const onRequestGet = () => Response.redirect(appStoreURL, 302);
export const onRequestHead = onRequestGet;
