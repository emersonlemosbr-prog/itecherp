// frontend/src/data/deviceCatalog.js
// Catálogo padrão de sugestões de modelos, variantes de armazenamento e marcas para o módulo Aparelhos

export const POPULAR_BRANDS = [
  'Apple',
  'Samsung',
  'Motorola',
  'Xiaomi',
  'Realme',
  'Oppo',
  'Asus',
  'Infinix',
  'Outra'
];

export const STORAGE_OPTIONS = [
  '32GB',
  '64GB',
  '128GB',
  '256GB',
  '512GB',
  '1TB',
  '2TB',
  'Outro'
];

export const CONDITION_OPTIONS = [
  { value: 'Lacrado', label: 'Lacrado', badgeColor: 'bg-emerald-100/90 text-emerald-800 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' },
  { value: 'Novo', label: 'Novo', badgeColor: 'bg-blue-100/90 text-blue-800 border-blue-300/70 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30' },
  { value: 'Seminovo', label: 'Seminovo', badgeColor: 'bg-purple-100/90 text-purple-800 border-purple-300/70 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30' },
  { value: 'CPO', label: 'CPO', badgeColor: 'bg-amber-100/90 text-amber-800 border-amber-300/70 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' },
  { value: 'Recondicionado', label: 'Recondicionado', badgeColor: 'bg-rose-100/90 text-rose-800 border-rose-300/70 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30' }
];

export const STATUS_MAP = {
  in_stock: { label: 'Em estoque', badgeClass: 'bg-emerald-100/90 text-emerald-800 border border-emerald-300/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' },
  reserved: { label: 'Reservado', badgeClass: 'bg-amber-100/90 text-amber-800 border border-amber-300/70 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30' },
  unavailable: { label: 'Indisponível', badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300/70 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30' },
  sold: { label: 'Vendido', badgeClass: 'bg-blue-100/90 text-blue-800 border border-blue-300/70 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30' },
  archived: { label: 'Arquivado', badgeClass: 'bg-zinc-100 text-zinc-700 border border-zinc-300/70 dark:bg-zinc-700/30 dark:text-zinc-400 dark:border-zinc-600/30' }
};

export const DEVICE_SUGGESTIONS = [
  // Apple
  { brand: 'Apple', model: 'iPhone 17', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 17', storage: '512GB' },
  { brand: 'Apple', model: 'iPhone 17 Pro', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 17 Pro', storage: '512GB' },
  { brand: 'Apple', model: 'iPhone 17 Pro', storage: '1TB' },
  { brand: 'Apple', model: 'iPhone 17 Pro Max', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 17 Pro Max', storage: '512GB' },
  { brand: 'Apple', model: 'iPhone 17 Pro Max', storage: '1TB' },
  { brand: 'Apple', model: 'iPhone 17 Air', storage: '256GB' },

  { brand: 'Apple', model: 'iPhone 16', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 16', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 16 Plus', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 16 Plus', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 16 Pro', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 16 Pro', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 16 Pro', storage: '512GB' },
  { brand: 'Apple', model: 'iPhone 16 Pro Max', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 16 Pro Max', storage: '512GB' },
  { brand: 'Apple', model: 'iPhone 16 Pro Max', storage: '1TB' },

  { brand: 'Apple', model: 'iPhone 15', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 15', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 15 Plus', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 15 Pro', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 15 Pro', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '512GB' },

  { brand: 'Apple', model: 'iPhone 14', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 14', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 14 Plus', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 14 Pro', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 14 Pro', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 14 Pro Max', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 14 Pro Max', storage: '256GB' },

  { brand: 'Apple', model: 'iPhone 13', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 13', storage: '256GB' },
  { brand: 'Apple', model: 'iPhone 13 Pro', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 13 Pro Max', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 12', storage: '64GB' },
  { brand: 'Apple', model: 'iPhone 12', storage: '128GB' },
  { brand: 'Apple', model: 'iPhone 11', storage: '64GB' },
  { brand: 'Apple', model: 'iPhone 11', storage: '128GB' },

  // Samsung
  { brand: 'Samsung', model: 'Galaxy S25 Ultra', storage: '512GB' },
  { brand: 'Samsung', model: 'Galaxy S25 Ultra', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S25+', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S25', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '512GB' },
  { brand: 'Samsung', model: 'Galaxy S24+', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S24', storage: '128GB' },
  { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S23 Ultra', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy S23', storage: '128GB' },
  { brand: 'Samsung', model: 'Galaxy Z Fold 6', storage: '512GB' },
  { brand: 'Samsung', model: 'Galaxy Z Flip 6', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '128GB' },
  { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '256GB' },
  { brand: 'Samsung', model: 'Galaxy A35 5G', storage: '128GB' },
  { brand: 'Samsung', model: 'Galaxy A15', storage: '128GB' },

  // Motorola
  { brand: 'Motorola', model: 'Edge 50 Ultra', storage: '512GB' },
  { brand: 'Motorola', model: 'Edge 50 Pro', storage: '256GB' },
  { brand: 'Motorola', model: 'Edge 50 Fusion', storage: '256GB' },
  { brand: 'Motorola', model: 'Moto G85 5G', storage: '256GB' },
  { brand: 'Motorola', model: 'Moto G54 5G', storage: '128GB' },
  { brand: 'Motorola', model: 'Moto G24', storage: '128GB' },

  // Xiaomi
  { brand: 'Xiaomi', model: 'Redmi Note 13 Pro+ 5G', storage: '256GB' },
  { brand: 'Xiaomi', model: 'Redmi Note 13 Pro 5G', storage: '256GB' },
  { brand: 'Xiaomi', model: 'Redmi Note 13 4G', storage: '128GB' },
  { brand: 'Xiaomi', model: 'Redmi Note 13 4G', storage: '256GB' },
  { brand: 'Xiaomi', model: 'POCO X6 Pro 5G', storage: '256GB' },
  { brand: 'Xiaomi', model: 'POCO X6 Pro 5G', storage: '512GB' },
  { brand: 'Xiaomi', model: 'POCO F6 5G', storage: '256GB' },
  { brand: 'Xiaomi', model: 'Xiaomi 14 Ultra', storage: '512GB' }
];

export function getSuggestions(brand = '', text = '') {
  const brandNorm = (brand || '').trim().toLowerCase();
  const textNorm = (text || '').trim().toLowerCase();

  return DEVICE_SUGGESTIONS.filter(item => {
    if (brandNorm && brandNorm !== 'outra' && item.brand.toLowerCase() !== brandNorm) {
      return false;
    }
    if (!textNorm) return true;
    const full = `${item.brand} ${item.model} ${item.storage}`.toLowerCase();
    return full.includes(textNorm);
  }).slice(0, 10);
}
