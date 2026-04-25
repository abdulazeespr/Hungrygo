export interface CreateReviewDto {
  rating: number;
  comment?: string;
}

export interface ReviewListQuery {
  cursor?: string;
  limit: number;
}
