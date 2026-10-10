import * as THREE from 'three';

export const MENU_CASHIER_PALETTE = {
  skin: '#edbb96',
  cheek: '#df9f87',
  hair: '#4f3528',
  cloth: '#873e43',
  trim: '#75343a',
  cream: '#efe0c6',
  gold: '#c6a15d',
  eyeWhite: '#f2e5d0',
  pupil: '#24272a',
  eyeHighlight: '#f0e6d2',
  lash: '#604a3c',
  smile: '#775044',
  paper: '#f1e3c7',
} as const;

export function createCashierMaterials() {
  const cloth = new THREE.MeshStandardMaterial({
    color: MENU_CASHIER_PALETTE.cloth,
    roughness: 1,
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
  cloth.userData.menuCashierRole = 'cloth';
  cuff.userData.menuCashierRole = 'cream';
  paper.userData.menuCashierRole = 'paper';
  return { cloth, cuff, paper };
}
