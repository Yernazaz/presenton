import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FASTAPI_URL } from "../_fastapi";

export const runtime = "nodejs";

export async function POST() {
  const token = cookies().get("auth_token")?.value;

  if (token) {
    await fetch(`${FASTAPI_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete("auth_token");
  return res;
}

