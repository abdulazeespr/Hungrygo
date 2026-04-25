export interface ListUsersQuery {
  role?: string;
  cursor?: string;
  limit: number;
}

export interface ListMessesQuery {
  status?: string;
  cursor?: string;
  limit: number;
}
