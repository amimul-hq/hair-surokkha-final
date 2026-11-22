import 'dotenv/config';
import { localJsonStore } from '../netlify/functions/db.js';

async function fixSlugs() {
  const products = await localJsonStore.getProducts();
  for (const p of products) {
    const name = p.name || p.title || 'Kirkland Minoxidil 5%';
    const slug = p.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await localJsonStore.updateProduct(p._id, { name, title: name, slug, stock: p.stock > 0 ? p.stock : 50 });
    console.log(`Updated product: ${name} -> slug: ${slug}`);
  }

}
fixSlugs();
