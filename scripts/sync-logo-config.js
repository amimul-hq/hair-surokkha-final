import 'dotenv/config';
import { localJsonStore } from '../netlify/functions/db.js';
const data = await localJsonStore.getWebsiteData();
await localJsonStore.updateWebsiteData({ siteSettings: {
  ...data.siteSettings,
  logoUrl: '/hair-shurokkha-logo-transparent.png',
  logoText: 'Hair Shurokkha',
  siteName: 'Hair Shurokkha Bangladesh',
}}, data.version);
console.log('Updated branding in the shared database.');
