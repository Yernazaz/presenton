import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FASTAPI_URL } from "../_fastapi";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const upstream = await fetch(`${FASTAPI_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}

