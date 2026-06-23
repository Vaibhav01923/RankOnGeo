import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const state = crypto.randomUUID();

  const cookieStore = await cookies();
  cookieStore.set("reddit_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  cookieStore.set("reddit_oauth_brand", brandId, { httpOnly: true, maxAge: 600, path: "/" });

  const params = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID!,
    response_type: "code",
    state,
    redirect_uri: process.env.REDDIT_REDIRECT_URI!,
    duration: "permanent",
    scope: "identity submit",
  });

  return NextResponse.redirect(`https://www.reddit.com/api/v1/authorize?${params}`);
}
