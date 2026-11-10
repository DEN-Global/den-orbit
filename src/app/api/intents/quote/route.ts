import { NextRequest, NextResponse } from "next/server";

const API = "https://1click.chaindefuser.com/v0";

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    const required = ["dry", "swapType", "originAsset", "destinationAsset", "amount", "recipient", "refundTo"];
    const missing = required.filter((field) => input[field] === undefined || input[field] === "");
    if (missing.length) return NextResponse.json({ error: `Missing required quote fields: ${missing.join(", ")}` }, { status: 400 });
    if (typeof input.amount !== "string" || !/^\d+$/.test(input.amount)) {
      return NextResponse.json({ error: "Amount must be an integer in the token's smallest unit." }, { status: 400 });
    }

    const headers = new Headers({ "Content-Type": "application/json" });
    if (process.env.NEAR_INTENTS_JWT) headers.set("Authorization", `Bearer ${process.env.NEAR_INTENTS_JWT}`);
    const response = await fetch(`${API}/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...input, swapType: "EXACT_INPUT" }),
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Could not request a 1Click quote. Check the inputs and try again." }, { status: 502 });
  }
}
