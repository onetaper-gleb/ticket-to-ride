import * as THREE from 'three';

export const MENU_CASHIER_PALETTE = {
  skin: '#edbb96',
  cloth: '#974a52',
  trim: '#71363e',
  cream: '#efe0c6',
  paper: '#f1e3c7',
} as const;

export function createCashierMaterials() {
  const cloth = new THREE.MeshStandardMaterial({
    color: MENU_CASHIER_PALETTE.cloth,
    roughness: 0.94,
  });
  const cuff = new THREE.MeshStandardMaterial({
    color: MENU_CASHIER_PALETTE.cream,
    roughness: 0.94,
  });
  const paper = new THREE.MeshStandardMaterial({
    color: MENU_CASHIER_PALETTE.paper,
    roughness: 1,
  });
  cloth.name = 'menu cashier burgundy wool';
  cuff.name = 'menu cashier cream cuff';
  paper.name = 'menu cashier neutral ticket paper';
  return { cloth, cuff, paper };
}
