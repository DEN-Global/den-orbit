import { NextResponse } from "next/server";

const API = "https://1click.chaindefuser.com/v0";

export async function GET() {
  try {
    const response = await fetch(`${API}/tokens`, { next: { revalidate: 3600 } });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the 1Click token list." }, { status: 502 });
  }
}
