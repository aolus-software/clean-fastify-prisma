export type AccessTokenPayload = { id: string; type: "access" };

export type RefreshTokenPayload = { id: string; type: "refresh"; jti: string };

export type TokenPair = { accessToken: string; refreshToken: string };
