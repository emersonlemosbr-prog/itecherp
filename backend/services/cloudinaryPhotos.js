const { v2: cloudinary } = require('cloudinary');
const sharp = require('sharp');
const { randomUUID } = require('crypto');

function client() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no backend.');
  }
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
  return cloudinary;
}

async function upload({ buffer, orderNumber, serviceOrderId }) {
  const sdk = client();
  let optimized;
  try {
    optimized = await sharp(buffer, { limitInputPixels: 80000000 }).rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch (_) { throw new Error('Imagem inválida ou não suportada. Use JPG, PNG ou WebP.'); }
  const folder = `itech/service-orders/${String(orderNumber || `OS-${String(serviceOrderId).padStart(5, '0')}`).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const result = await new Promise((resolve, reject) => {
    sdk.uploader.upload_stream({ folder, public_id: randomUUID(), resource_type: 'image', timeout: 120000 },
      (error, response) => error ? reject(new Error('Falha no upload para o Cloudinary. Tente novamente.')) : resolve(response)).end(optimized);
  });
  return { public_id: result.public_id, url: result.secure_url, storageKey: result.public_id, mimeType: 'image/webp', fileSize: optimized.length };
}

async function uploadProduct({ buffer, productId, productCode }) {
  const sdk = client();
  let optimized;
  try {
    optimized = await sharp(buffer, { limitInputPixels: 80000000 }).rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch (_) { throw new Error('Imagem inválida ou não suportada. Use JPG, PNG ou WebP.'); }
  const safeCode = String(productCode || `produto-${productId}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const result = await new Promise((resolve, reject) => {
    sdk.uploader.upload_stream({ folder: `itech/products/${safeCode}`, public_id: randomUUID(), resource_type: 'image', timeout: 120000 },
      (error, response) => error ? reject(new Error('Falha no upload para o Cloudinary. Tente novamente.')) : resolve(response)).end(optimized);
  });
  return { public_id: result.public_id, url: result.secure_url, mimeType: 'image/webp', fileSize: optimized.length };
}

async function remove(publicId) {
  const result = await client().uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  if (!['ok', 'not found'].includes(result.result)) throw new Error('Não foi possível excluir a foto do Cloudinary.');
  return true;
}

module.exports = { upload, uploadProduct, delete: remove };
