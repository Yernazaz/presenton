import { NextResponse } from "next/server";
import { FASTAPI_URL } from "../_fastapi";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${FASTAPI_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const token = data?.token;
  if (!token) {
    return NextResponse.json({ detail: "No token returned" }, { status: 502 });
  }

  const secureCookie = process.env.COOKIE_SECURE === "true";
  const res = NextResponse.json({ ok: true, teacher: data?.teacher });
  res.cookies.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookie,
  });
  return res;
}
