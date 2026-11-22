import 'dotenv/config';
import { localJsonStore } from '../netlify/functions/db.js';

async function fixData() {
  const doc = await localJsonStore.getWebsiteData();
  // Set default images if missing and serial numbers for categories
  const categoryImages = {
    'minoxidil': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    'derma-roller': 'https://images.unsplash.com/photo-1512290900672-1f55b9a4c062?w=600&auto=format&fit=crop&q=80',
    'combo-packages': 'https://images.unsplash.com/photo-1608248597359-54378f4a1ad5?w=600&auto=format&fit=crop&q=80',
    'scalp-care-accessories': 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop&q=80'
  };

  const defaultCategoryOrders = {
    'minoxidil': 1,
    'derma-roller': 2,
    'combo-packages': 3,
    'scalp-care-accessories': 4
  };

  const updatedCategories = (doc.categories || []).map((cat, idx) => {
    const slug = cat.slug || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let order = defaultCategoryOrders[slug] || idx + 1;
    return {
      ...cat,
      image: (cat.image && cat.image.trim()) ? cat.image : (categoryImages[slug] || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80'),
      displayOrder: order
    };
  });

  // Assign clean displayOrder for products within each category if undefined
  const catProductCounters = {};
  const updatedProducts = (doc.products || []).map((prod) => {
    const cat = prod.category || 'Other';
    catProductCounters[cat] = (catProductCounters[cat] || 0) + 1;
    const order = (prod.displayOrder !== undefined && prod.displayOrder !== null && prod.displayOrder > 0) ? Number(prod.displayOrder) : catProductCounters[cat];
    return {
      ...prod,
      displayOrder: order,
      carouselOrder: order
    };
  });

  await localJsonStore.updateWebsiteData({ categories: updatedCategories, products: updatedProducts }, doc.version);
}
fixData();
