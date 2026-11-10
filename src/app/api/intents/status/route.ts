import { NextRequest, NextResponse } from "next/server";

const API = "https://1click.chaindefuser.com/v0";

export async function GET(request: NextRequest) {
  const depositAddress = request.nextUrl.searchParams.get("depositAddress");
  if (!depositAddress) return NextResponse.json({ error: "depositAddress is required." }, { status: 400 });
  const url = new URL(`${API}/status`);
  url.searchParams.set("depositAddress", depositAddress);
  const depositMemo = request.nextUrl.searchParams.get("depositMemo");
  if (depositMemo) url.searchParams.set("depositMemo", depositMemo);
  const headers = new Headers();
  if (process.env.NEAR_INTENTS_JWT) headers.set("Authorization", `Bearer ${process.env.NEAR_INTENTS_JWT}`);
  try {
    const response = await fetch(url, { headers, cache: "no-store" });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Could not check the 1Click swap status." }, { status: 502 });
  }
}
