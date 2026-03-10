import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse<{ status: string; project: string }>> {
  return NextResponse.json({ status: "ok", project: "qrapido" });
}
