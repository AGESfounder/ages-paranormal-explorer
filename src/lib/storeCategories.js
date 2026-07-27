export const categoryLabels = {
  equipment: 'Devices',
  apparel: 'Apparel',
  other: 'Other',
};

export const categoryRoutes = [
  { value: 'equipment', label: 'Devices', path: '/store/devices' },
  { value: 'apparel', label: 'Apparel', path: '/store/apparel' },
  { value: 'other', label: 'Other', path: '/store/other' },
];

// "Other" also catches any legacy categories that aren't equipment/apparel.
export function isOtherCategory(category) {
  return category !== 'equipment' && category !== 'apparel';
}