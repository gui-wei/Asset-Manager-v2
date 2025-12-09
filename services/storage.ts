import { Asset } from '../types';

const STORAGE_KEY = 'wechat_asset_manager_data_v1';

export const saveAssets = (assets: Asset[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
};

export const getAssets = (): Asset[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load from local storage", e);
    return [];
  }
};

// Helper to get unique product names for auto-complete
export const getUniqueProductNames = (assets: Asset[]): string[] => {
  const names = new Set<string>();
  assets.forEach(a => names.add(a.productName));
  return Array.from(names);
};