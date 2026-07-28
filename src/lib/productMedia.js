export function getImages(product) {
  if (product && product.images && product.images.length) return product.images.filter(Boolean);
  if (product && product.image_url) return [product.image_url];
  return [];
}

export function getGallery(product) {
  const items = getImages(product).map(url => ({ type: 'image', url }));
  if (product && product.video_url) items.push({ type: 'video', url: product.video_url });
  return items;
}