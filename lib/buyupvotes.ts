const BASE_URL = "https://buyupvotes.net/api/public/v1";

export class BuyUpvotesError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.BUYUPVOTES_API_KEY!,
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new BuyUpvotesError(res.status, body?.error ?? `BuyUpvotes request failed (${res.status})`);
  }
  return body as T;
}

export type BuyUpvotesService = "post_upvote" | "post_downvote" | "comment_upvote" | "comment_downvote" | "custom_comments";

export type CreateOrderParams =
  | { service: "post_upvote" | "post_downvote" | "comment_upvote" | "comment_downvote"; link: string; quantity: number; speed?: number }
  | { service: "custom_comments"; link: string; comments: string; delay1?: number; delay2?: number };

export type CreateOrderResponse = {
  status: string;
  orderId: number;
  cost: number;
  balanceAfter: number;
};

export function createOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
  return request<CreateOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export type OrderStatus = "pending" | "running" | "completed" | "failed";

export async function checkStatuses(orderIds: (string | number)[]): Promise<{ orderId: number; status: OrderStatus }[]> {
  if (orderIds.length === 0) return [];
  const chunks: (string | number)[][] = [];
  for (let i = 0; i < orderIds.length; i += 100) chunks.push(orderIds.slice(i, i + 100));

  const results = await Promise.all(
    chunks.map((chunk) =>
      request<{ results: { orderId: number; status: OrderStatus }[] }>("/status", {
        method: "POST",
        body: JSON.stringify({ orders: chunk }),
      }).then((r) => r.results)
    )
  );
  return results.flat();
}

export function getBalance(): Promise<{ balance: number }> {
  return request<{ balance: number }>("/balance");
}
