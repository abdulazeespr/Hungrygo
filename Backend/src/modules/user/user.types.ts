export interface UpdateUserDto {
  name?: string;
  email?: string;
  dietaryPref?: 'veg' | 'non_veg' | 'egg';
}

export interface CreateAddressDto {
  label?: string;
  fullAddress: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}

export interface UpdateAddressDto extends Partial<CreateAddressDto> {}
