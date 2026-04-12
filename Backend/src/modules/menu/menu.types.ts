export interface MenuItem {
  name: string;
  description: string;
  isSpecial: boolean;
}

export interface UpsertMenuDto {
  date: string;
  mealSlot: 'breakfast' | 'lunch' | 'dinner';
  items: MenuItem[];
  isHoliday?: boolean;
  photoUrl?: string | null;
}
