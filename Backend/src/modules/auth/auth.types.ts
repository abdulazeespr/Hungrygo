export interface JwtPayload {
  sub: string;
  role: string;
  phone: string;
}

export interface RefreshPayload {
  sub: string;
  tokenId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenId: string;
}
